/** Scale an ingredient amount only when both serving counts are known. */
export function scalePlanQuantity(
  quantity: number | null,
  recipeServings: number | null,
  plannedServings: number | null,
) {
  if (
    quantity === null ||
    !recipeServings ||
    !plannedServings ||
    recipeServings <= 0
  ) {
    return quantity
  }

  return Math.round((quantity * plannedServings * 1000) / recipeServings) / 1000
}
