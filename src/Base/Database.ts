import { TDBConstructor } from "../types/TDBConstructor";
import { TIndexedModel } from "../types/TIndexedModel";

/**
 * @template TInterfacedModel Model Interface to derive the keys from. Interfaces should not contain
 *                            `id` property as it's implicitly appended by Base Model and the
 *                            Database class
 * @template TModel           Custom Model Class used for return types
 */
export class Database<TInterfacedModel, TModel extends TInterfacedModel> {
  /**
   * Current database index.
   */
  private autoincrement = 0;
  private records: Map<number, TInterfacedModel> = new Map();

  /**
   * Represents the results of the last used Where Clause.
   *
   * NOTICE: this will only be cleared when called with Get/Delete
   */
  private lastQuery: Map<number, TInterfacedModel> = new Map();

  /**
   * @param   {TDBConstructor<TInterfacedModel>}  modelDefinition   Custom Model class used as a
   * template for model definition instantiation
   */
  public constructor(private modelDefinition: TDBConstructor<TInterfacedModel, TModel>) {
    //
  }

  /**
   * Returns all models from this database
   */
  public all = (): TModel[] => {
    const models: TModel[] = [];

    // Instantiate all models from this database
    this.records.forEach((record: TInterfacedModel, index: number): void => {
      models.push(this.createFromTemplate(record, index));
    });

    return models;
  };

  /**
   * Returns the current size in records in the query scope. If `scoped` argument is set to false, will return the
   * Database record size instead
   *
   * @param   {boolean} scopedSize  `true` by default, return Query Scope size. When `false` will check the size of
   * the Database
   */
  public count = (scopedSize = true): number => scopedSize ? this.lastQuery.size : this.records.size;

  /**
   * Deletes all filtered models from the Database.
   *
   * @returns Removed records count
   */
  public delete = (): number => {
    const iterator = this.lastQuery.entries();
    let result = iterator.next();
    let recordsRemoved = 0;

    while (!result.done) {
      // Delete the matching record with the internal id
      if (this.records.delete(result.value[0])) {
        recordsRemoved++;
      }

      result = iterator.next();
    }

    this.lastQuery.clear();

    return recordsRemoved;
  };

  /**
   * Retrieves and instantiates a new model indexed by the given `id`
   *
   * @param   {number}  index  Model index in the database
   */
  public find = (index: number): TModel | undefined => {
    const model = this.records.get(index);

    if (!model) {
      return undefined;
    }

    return this.createFromTemplate(model, index);
  };

  /**
   * Returns the first model from the query scope
   *
   * When `retrieveFromLastQuery` is set to false, will return the first database model instead.
   *
   * @param   {boolean}  retrieveFromLastQuery  Allows retrieving models from query scopes (Where
   * Clause). By default, Where Clause is used, but when set to `false`, will return the first record
   * from Database.
   */
  public first = (retrieveFromLastQuery = true): TModel | undefined => {
    const firstModel = this.switchRecordsRetrieval(retrieveFromLastQuery).entries().next();

    // Database can be empty, so we can just return undefined
    if (!firstModel.value) {
      return;
    }

    this.lastQuery.clear();

    // Instantiate when available
    return this.createFromTemplate(firstModel.value[1], firstModel.value[0]);
  };

  /**
   * Executes the selected models instantiation and returns them as an array of those models (or
   * empty)
   */
  public get = (): TModel[] => {
    const models: TModel[] = [];

    // Instantiate only the selected models
    this.lastQuery.forEach((record: TInterfacedModel, index: number): void => {
      models.push(this.createFromTemplate(record, index));
    });

    // Prepare the query for new results
    this.lastQuery.clear();

    return models;
  };

  /**
   * Inserts the given model definition into the database and returns a new instance of this model
   * based on the
   * given definition when prompted
   *
   * @param   {TInterfacedModel}  definition  Model definition later used to instantiate the new
   * model with
   */
  public insert = (definition: TInterfacedModel): TModel => {
    ++this.autoincrement;

    // Insert this definition under the next database index
    this.records.set(this.autoincrement, definition);

    return this.createFromTemplate(definition, this.autoincrement);
  };

  /**
   * Returns the last model from the query scope
   *
   * When `retrieveFromLastQuery` is set to false, will return the last database model instead
   *
   * @param   {boolean}  retrieveFromLastQuery  Allows retrieving models from query scopes (Where
   * Clause). By default, Where Clause is used, but when set to `false`, will return the last record
   * from Database.
   */
  public last = (retrieveFromLastQuery = true): TModel | undefined => {
    const lastModel = this.switchRecordsRetrieval(retrieveFromLastQuery).get(this.autoincrement);

    // Database can be empty, so we can just return undefined
    if (!lastModel) {
      return;
    }

    this.lastQuery.clear();

    return this.createFromTemplate(lastModel, this.autoincrement);
  };

  /**
   * Clears this database of any existing records, including the last used query
   */
  public truncate = (): void => {
    this.lastQuery.clear();
    this.records.clear();
  };

  /**
   * Updates all recently selected models with the provided definition override. Performs a parallel
   * update with the database records.
   *
   * NOTICE: `id` can't be updated, so we don't need to include it here
   * NOTICE: updates don't clear the lastQuery results as these methods could be chained for
   * multiple update purposes and eventual final `getter`
   *
   */
  public update = <Key extends keyof TInterfacedModel>(
    where: keyof Pick<TInterfacedModel, Key>,
    value: TInterfacedModel[Key]
  ): this => {
    const iterator = this.lastQuery.entries();
    let result = iterator.next();

    while (!result.done) {
      const dbModel = this.records.get(result.value[0]);

      if (!dbModel) {
        // This technically should not reach the following block, because the user would need to
        // select certain records, perform an external delete, then perform this update, which
        // most likely be unintended anyway
        throw new Error(`Record under ${result.value[0]} did not exist in the database`);
      }

      result.value[1][where] = value;

      // Necessary cast as we are in a non-nullable context, so we have to match the inferred type
      dbModel[where] = value as NonNullable<TInterfacedModel>[Key];

      result = iterator.next();
    }

    // Return for chaining
    return this;
  };

  /**
   * Filters the currently held records by provided filter: column -> value and stores them in the
   * recently used query, appending the results - overridden by shared filtering clauses.
   *
   * The results can be retrieved with `.get()` as a final call.
   *
   * @param   {keyof T} whereColumn   Which column to access from the records
   * @param   {T[Key]}  value         Value to filter the records with from the provided column
   */
  /* The union in the `whereColumn` argument is required to extend the `Key`'s list of properties */
  public where = <Key extends keyof TInterfacedModel | keyof TIndexedModel>(
    /* The type intersection is required to expose the optional `id` property */
    whereColumn: keyof Pick<TInterfacedModel & TIndexedModel, Key>,
    /* The Required<> type intersection is required to satisfy the `Key`'s constraints and to force
       the actual type for that argument, since the intersected property is optional */
    value: (TInterfacedModel & Required<TIndexedModel>)[Key]
  ): this => {
    // Switch to a separate method for an index lookup, we can just do this here and return
    if (whereColumn === "id") {
      return this.whereIndexed(value as number);
    }

    const iterator = this.records.entries();
    let result = iterator.next();

    // Filter all records and select only those matching the criteria
    while (!result.done) {
      // Store the matching record with the corresponding internal index
      if (result.value[1][whereColumn as keyof TInterfacedModel] === value) {
        this.lastQuery.set(result.value[0], result.value[1]);
      }

      result = iterator.next();
    }

    // Return for chaining
    return this;
  };

  /**
   * Shorthand for instantiating a new model from the supplied definition under certain `id`
   *
   * @param   {TInterfacedModel}  definition  Model definition fro the database to create a new instance fromm
   * @param   {number}            id          Exact `id` from the database for this model
   */
  private createFromTemplate = (definition: TInterfacedModel, id: number): TModel => new this.modelDefinition(Object.assign({ id }, definition));

  /**
   * Switches the internal Map where the records should be retrieved from.
   *
   * @param   {boolean}  state  `true` returns `lastQuery` (filtered models), `false` returns
   * Database records
   */
  private switchRecordsRetrieval = (state: boolean): Map<number, TInterfacedModel> => state ? this.lastQuery : this.records;

  /**
   * Stores the selected model in the last query for further processing (query scope)
   *
   * @param   {number}  index  Model index
   */
  private whereIndexed = (index: number): this => {
    const model = this.records.get(index);

    if (model) {
      this.lastQuery.set(index, model);
    }

    return this;
  };
}
