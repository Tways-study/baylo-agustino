import { getCategories, getMeetupSpots } from '@/lib/listings/queries'
import { PostSheet } from './PostSheet'

export default async function PostPage() {
  const [categories, meetupSpots] = await Promise.all([getCategories(), getMeetupSpots()])
  return <PostSheet categories={categories} meetupSpots={meetupSpots} />
}
