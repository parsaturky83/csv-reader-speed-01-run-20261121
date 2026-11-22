// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Returns exactly csv-reader 1.0.0's answer {columns, rows, errors} for an
// input {text, header}. Same reading policy, re-implemented for speed:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote and each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's short_row or
//     long_row when it ends: line the 1-based line its record starts on, counting
//     every LF, CRLF and lone CR inside quotes, and row its record's index in
//     rows, null for the header.
//
// Speed comes from slicing fields instead of building them a character at a
// time, and from returning no per-field objects: the readers hand back the
// field's string and leave how it ended in fEnded (0 comma, 1 line break,
// 2 end of text) and, for the junk check, how many characters were kept in
// fAdded. No clock, no randomness, no locale, nothing kept from one call to
// the next.

/** A field's end: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended, and (for the junk check) how many characters it kept.
  let fEnded = END;
  let fAdded = 0;

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field; fEnded says how it ended and fAdded counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      const start = pos;
      while (pos < len) {
        const c = text.charCodeAt(pos);
        if (c === 44 || c === 10 || c === 13) break;
        pos += 1;
      }
      if (pos > start) {
        value += text.slice(start, pos);
        added += pos - start;
      }
      if (pos >= len) {
        fEnded = END;
        fAdded = added;
        return value;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fEnded = COMMA;
        fAdded = added;
        return value;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fEnded = LINE_BREAK;
        fAdded = added;
        return value;
      }
      // c === 13: a CR followed by LF ends the line; a lone CR is dropped (stray_cr).
      if (text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fEnded = LINE_BREAK;
        fAdded = added;
        return value;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos += 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field; fEnded says how it ended.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    // Find the closing quote: the next quote that is not doubled.
    let close = -1;
    let escaped = false;
    let from = pos + 1;
    for (;;) {
      const q = text.indexOf('"', from);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        escaped = true;
        from = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    let value;
    const nl = text.indexOf('\n', pos + 1);
    const hasNL = nl !== -1 && nl < close;
    const cr = text.indexOf('\r', pos + 1);
    const hasCR = cr !== -1 && cr < close;
    if (!escaped && !hasNL && !hasCR) {
      value = text.slice(pos + 1, close);
    } else {
      // "" inside is one quote; each CRLF or lone CR inside is read as LF.
      const span = text.slice(pos + 1, close);
      value = span.replace(/\r\n?/g, '\n').replace(/""/g, '"');
      const breaks = span.match(/\r\n?|\n/g);
      if (breaks !== null) line += breaks.length;
    }
    pos = close + 1;
    if (pos >= len) {
      fEnded = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fEnded = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fEnded = LINE_BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnded = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      fields.push(quoted ? readQuoted() : readUnquoted(''));
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
