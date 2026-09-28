/** Legacy QA fixtures were saved as active products without isTestData. */
export function isSyntheticProduct(product: { isTestData?: boolean; productName?: string; description?: string }): boolean {
  return product.isTestData === true || /^QA-\d+-\d+\s+Product\s+TEST$/i.test(product.productName || '') || /\bDO NOT PREPARE\b/i.test(product.description || '');
}
