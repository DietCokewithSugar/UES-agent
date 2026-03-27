import mammoth from 'mammoth';

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });

const readFileAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(reader.error || new Error('文本读取失败'));
    reader.readAsText(file, 'utf-8');
  });

const extractTextFromDocx = async (file: File): Promise<string> => {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
};

const extractTextFromPdf = async (file: File): Promise<string> => {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await readFileAsArrayBuffer(file);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (text) pageTexts.push(text);
  }

  return pageTexts.join('\n');
};

export const extractTextFromFile = async (file: File): Promise<string> => {
  const lowerName = file.name.toLowerCase();
  if (file.type.startsWith('text/') || lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return readFileAsText(file);
  }

  if (
    file.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    return extractTextFromDocx(file);
  }

  if (file.type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return extractTextFromPdf(file);
  }

  throw new Error('暂不支持该文件类型，请上传 txt/doc/docx/pdf。');
};
