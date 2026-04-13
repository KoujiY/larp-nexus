import { extractRawText } from 'mammoth';

/**
 * 將 .docx Buffer 轉為純文字
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await extractRawText({ buffer });
    return result.value;
  } catch {
    throw new Error('文件格式無法解析，請改用貼上文字');
  }
}
