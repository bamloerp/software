'use server';

import { getCurrentUser } from '@/lib/auth';
import { renderDispatchPdf } from '@/lib/pdf/puppeteer';

type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export async function generateDispatchPdf(
  dispatchId: string,
): Promise<ActionResult<{ base64: string; filename: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error('Authentication required');

    const result = await renderDispatchPdf(dispatchId);
    return {
      ok: true,
      data: {
        base64: result.buffer.toString('base64'),
        filename: result.filename,
      },
    };
  } catch (error) {
    console.error('[generateDispatchPdf]', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to generate PDF' };
  }
}
