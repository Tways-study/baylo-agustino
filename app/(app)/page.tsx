import { Ribbon, EmptyState, NotificationBell } from '@/components/ui'
import { getCategories } from '@/lib/listings/queries'
import { getFeedListings, getSavedListingIds, getRecentSearches } from '@/lib/discovery/queries'
import { getUnreadNotifications } from '@/lib/offers/queries'
import { parseFeedFilters } from '@/lib/discovery/schemas'
import { getAuthUser } from '@/lib/auth/session'
import { SearchBar } from './SearchBar'
import { FilterChips } from './FilterChips'
import { FeedList } from './FeedList'

interface FeedPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const rawParams = await searchParams
  const filters = parseFeedFilters(rawParams)

  const [categories, user] = await Promise.all([getCategories(), getAuthUser()])
  const [{ listings, nextCursor }, savedIds, recentSearches, notifications] = await Promise.all([
    getFeedListings(filters, categories),
    user ? getSavedListingIds(user.id) : Promise.resolve(new Set<string>()),
    user ? getRecentSearches(user.id) : Promise.resolve([]),
    user ? getUnreadNotifications(user.id) : Promise.resolve([]),
  ])

  const hasActiveFilters = Boolean(
    filters.q ||
    filters.intent ||
    filters.category ||
    filters.condition ||
    filters.price ||
    filters.photos,
  )
  const activeFilterCount = [
    filters.category,
    filters.condition,
    filters.price,
    filters.photos,
  ].filter(Boolean).length

  return (
    <>
      <header>
        <Ribbon end={user && <NotificationBell notifications={notifications} />}>Feed</Ribbon>
      </header>
      <main className="flex flex-col gap-3 px-4 py-4">
        <SearchBar initialQuery={filters.q ?? ''} recentSearches={recentSearches} />
        <FilterChips
          activeIntent={filters.intent ?? null}
          activeFilterCount={activeFilterCount}
          categories={categories}
          initialCategory={filters.category ?? null}
          initialCondition={filters.condition ?? null}
          initialPrice={filters.price ?? null}
          initialPhotos={filters.photos === '1'}
        />

        {listings.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState
              headline="Nothing matches yet."
              body="Try different words, or check back later."
            />
          ) : (
            <EmptyState
              headline="Nothing on the floor yet."
              body="Post the thing you're not using. Someone out there needs a Casio or a lab gown."
              ctaLabel="Post something"
              ctaHref="/post"
            />
          )
        ) : (
          <FeedList
            initialListings={listings}
            initialCursor={nextCursor}
            filters={filters}
            categories={categories}
            initialSavedIds={Array.from(savedIds)}
          />
        )}
      </main>
    </>
  )
}
