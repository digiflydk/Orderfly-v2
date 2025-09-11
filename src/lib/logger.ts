
export const logger = {
  info:  (...a: any[]) => console.log('[OF]', ...a),
  error: (...a: any[]) => console.error('[OF]', ...a),
};
