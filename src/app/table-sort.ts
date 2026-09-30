// Values for MatTableDataSource.sortingDataAccessor: text case-insensitively the Danish way,
// numbers as themselves, booleans as 1/0, and rooms as numbers where they are numbers.
export function sortValue(v: unknown): string | number {
  if (typeof v === 'string') {
    return /^\d+$/.test(v) ? Number(v) : v.toLocaleLowerCase('da');
  }
  if (typeof v === 'number') {
    return v;
  }
  return v ? 1 : 0;
}
