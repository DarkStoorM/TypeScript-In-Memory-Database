import { beforeEach, expect, test } from "vitest";
import { BookFactory } from "./Mocks/BookFactory";
import { BooksDB } from "./Mocks/BookModel";

beforeEach((): void => {
  BooksDB.truncate();
});

test("Can save edited model into the database", (): void => {
  const book = BookFactory.create();

  book.pages = 99999;
  book.save();

  const dbBook = BooksDB.whereIndexed(book.id).first();

  if (!dbBook) {
    throw new Error(`There was no book under the given index ${book.id}`);
  }

  expect(dbBook.pages).toBe(99999);
});

test("Does not save model in the database without save() call", (): void => {
  const book = BookFactory.create();

  book.pages = 99999;

  const dbBook = BooksDB.whereIndexed(book.id).first();

  if (!dbBook) {
    throw new Error(`There was no book under the given index ${book.id}`);
  }

  expect(dbBook.pages).not.toBe(99999);
});
