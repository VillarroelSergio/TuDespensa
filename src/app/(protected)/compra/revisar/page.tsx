import { getCheckoutPreview } from '@/modules/shopping/actions'
import { CheckoutReview } from '@/modules/shopping/CheckoutReview'

export default async function CheckoutReviewPage() {
  const lines = await getCheckoutPreview()
  return <CheckoutReview initialLines={lines} />
}
