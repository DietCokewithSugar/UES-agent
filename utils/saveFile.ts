import * as FileSaver from 'file-saver';

/**
 * 触发浏览器下载。
 *
 * file-saver 在不同打包方式下导出形态不一致（命名导出 / default / 模块本身即函数），
 * 这里做一次 interop 兜底。原先 App.tsx 与 AIExperienceCompanion.tsx 各有一份同样的实现，
 * 现在统一到这里。
 */
export const saveFile = (data: Blob | string, filename: string) => {
  const save = (FileSaver as any).saveAs || (FileSaver as any).default || FileSaver;
  if (typeof save === 'function') save(data, filename);
};
