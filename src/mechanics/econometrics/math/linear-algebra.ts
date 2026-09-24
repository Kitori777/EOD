export type Matrix = number[][];

export function transposeMatrix(matrix: Matrix): Matrix {
  return matrix[0]?.map((_, column) => matrix.map((row) => row[column])) ?? [];
}

export function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  return left.map((row) => right[0].map((_, column) => (
    row.reduce((sum, value, index) => sum + value * right[index][column], 0)
  )));
}

export function invertMatrix(matrix: Matrix): Matrix | null {
  const size = matrix.length;
  if (!size || matrix.some((row) => row.length !== size)) return null;

  const work = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, column) => Number(index === column)),
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row][column]) > Math.abs(work[pivot][column])) pivot = row;
    }
    if (Math.abs(work[pivot][column]) < 1e-10) return null;

    [work[column], work[pivot]] = [work[pivot], work[column]];
    const divisor = work[column][column];
    work[column] = work[column].map((value) => value / divisor);

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = work[row][column];
      work[row] = work[row].map((value, index) => value - factor * work[column][index]);
    }
  }

  return work.map((row) => row.slice(size));
}
