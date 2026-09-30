import { describe, expect, it } from "vitest";
import { formatDeadline, isRsvpOpen, isValidDeadline, londonDate } from "./deadline";

describe("isRsvpOpen", () => {
  it("stays open when no deadline is set", () => {
    expect(isRsvpOpen(null, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });

  it("is open on the deadline day and closed the day after, in London time", () => {
    // BST: 1 June 23:30 in London is 22:30 UTC.
    expect(isRsvpOpen("2027-06-01", new Date("2027-06-01T22:30:00Z"))).toBe(true);
    // 2 June 00:30 in London is 1 June 23:30 UTC, already past the deadline in London.
    expect(isRsvpOpen("2027-06-01", new Date("2027-06-01T23:30:00Z"))).toBe(false);
    expect(isRsvpOpen("2027-06-01", new Date("2027-05-01T12:00:00Z"))).toBe(true);
  });

  it("uses GMT in winter", () => {
    expect(isRsvpOpen("2027-01-10", new Date("2027-01-10T23:59:00Z"))).toBe(true);
    expect(isRsvpOpen("2027-01-10", new Date("2027-01-11T00:00:00Z"))).toBe(false);
  });
});

describe("deadline helpers", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDeadline("2027-06-01")).toBe(true);
    expect(isValidDeadline("2027-02-30")).toBe(false);
    expect(isValidDeadline("01/06/2027")).toBe(false);
    expect(isValidDeadline("")).toBe(false);
  });

  it("formats and reads dates", () => {
    expect(formatDeadline("2027-06-01")).toBe("1 June 2027");
    expect(londonDate(new Date("2027-08-27T23:30:00Z"))).toBe("2027-08-28");
  });
});
