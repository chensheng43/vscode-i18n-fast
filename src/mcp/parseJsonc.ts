export function stripJsonComments(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j++;
        j++;
      }
      result += text.slice(i, j + 1);
      i = j + 1;
    } else if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += text[i];
      i++;
    }
  }

  return result;
}

function stripTrailingCommas(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') j++;
        j++;
      }
      result += text.slice(i, j + 1);
      i = j + 1;
    } else if (text[i] === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (j < text.length && (text[j] === ']' || text[j] === '}')) {
        i++;
      } else {
        result += text[i];
        i++;
      }
    } else {
      result += text[i];
      i++;
    }
  }

  return result;
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripTrailingCommas(stripJsonComments(text)));
}
