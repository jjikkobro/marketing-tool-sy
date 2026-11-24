/** 터미널 표 출력. 한글·이모지는 두 칸을 차지하므로 폭을 따로 계산한다. */

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|\p{Extended_Pictographic}/u;

export function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) width += WIDE.test(char) ? 2 : 1;
  return width;
}

function pad(text: string, width: number, align: 'left' | 'right'): string {
  const space = ' '.repeat(Math.max(0, width - displayWidth(text)));
  return align === 'right' ? space + text : text + space;
}

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null;
  align?: 'left' | 'right';
}

export function renderTable<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const cells = rows.map((row) =>
    columns.map((column) => {
      const value = column.value(row);
      return value === null ? '—' : String(value);
    }),
  );
  const widths = columns.map((column, i) =>
    Math.max(displayWidth(column.header), ...cells.map((row) => displayWidth(row[i] ?? ''))),
  );
  const line = (values: string[]) =>
    values.map((value, i) => pad(value, widths[i] ?? 0, columns[i]?.align ?? 'left')).join('  ');

  return [
    line(columns.map((column) => column.header)),
    widths.map((width) => '─'.repeat(width)).join('  '),
    ...cells.map(line),
  ].join('\n');
}
