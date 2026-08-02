'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, Button, Panel } from '@/components/ui'
import type { Intent } from '@/components/ui'
import type { CategoryRow, MeetupSpotRow } from '@/types/database'
import { compressToWebp } from '@/lib/media/compress-image'
import { createClient } from '@/lib/supabase/client'
import { createListing } from '@/lib/listings/actions'
import { pesosToCentavos } from '@/lib/listings/format'
import { scanListingText, type ScanResult } from '@/lib/listings/banned-words'
import { ListingDetailsFields, type ListingDetailsValue } from './ListingDetailsFields'

interface PostSheetProps {
  categories: CategoryRow[]
  meetupSpots: MeetupSpotRow[]
}

interface UploadedImage {
  id: string
  previewUrl: string
  storagePath: string | null
  status: 'uploading' | 'done' | 'error'
}

const MAX_IMAGES = 4

const STEP_TITLES = ['What kind of post is this?', 'Add photos', 'The details']

const INTENT_OPTIONS: { value: Intent; label: string; hint: string }[] = [
  { value: 'swap', label: 'Swap', hint: 'Trade it for something else' },
  { value: 'sale', label: 'Sale', hint: 'Sell it for a price' },
  { value: 'give', label: 'Give', hint: 'Free to whoever claims it first' },
]

const emptyDetails: ListingDetailsValue = {
  title: '',
  description: '',
  categoryId: null,
  condition: null,
  meetupSpotId: null,
  wants: [''],
  acceptsCash: false,
  askPesos: '',
  estimatedValuePesos: '',
}

export function PostSheet({ categories, meetupSpots }: PostSheetProps) {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [listingId] = useState(() => crypto.randomUUID())
  const [intent, setIntent] = useState<Intent | null>(null)
  const [images, setImages] = useState<UploadedImage[]>([])
  const [details, setDetails] = useState<ListingDetailsValue>(emptyDetails)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<{ message: string; hard?: boolean } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const bannedScan: ScanResult = useMemo(
    () => scanListingText(`${details.title} ${details.description}`),
    [details.title, details.description],
  )

  function close() {
    router.push('/')
  }

  async function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const remaining = MAX_IMAGES - images.length
    const toProcess = files.slice(0, remaining)

    for (const file of toProcess) {
      const localId = crypto.randomUUID()
      const previewUrl = URL.createObjectURL(file)
      setImages((prev) => [
        ...prev,
        { id: localId, previewUrl, storagePath: null, status: 'uploading' },
      ])

      try {
        const compressed = await compressToWebp(file, { maxSizeMB: 0.4, maxWidthOrHeight: 1280 })
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Session expired.')

        const objectPath = `${user.id}/${listingId}/${crypto.randomUUID()}.webp`
        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(objectPath, compressed, { contentType: 'image/webp' })

        if (uploadError) throw uploadError

        if (process.env.NODE_ENV !== 'production') {
          ;(window as unknown as { __lastUploadedPathForTest?: string }).__lastUploadedPathForTest =
            objectPath
        }

        setImages((prev) =>
          prev.map((img) =>
            img.id === localId ? { ...img, storagePath: objectPath, status: 'done' } : img,
          ),
        )
      } catch {
        setImages((prev) =>
          prev.map((img) => (img.id === localId ? { ...img, status: 'error' } : img)),
        )
      }
    }
  }

  async function removeImage(id: string) {
    const image = images.find((img) => img.id === id)
    setImages((prev) => prev.filter((img) => img.id !== id))
    if (image?.storagePath) {
      const supabase = createClient()
      await supabase.storage.from('listing-images').remove([image.storagePath])
    }
  }

  const imagesUploading = images.some((img) => img.status === 'uploading')
  const donePaths = images
    .filter((img) => img.status === 'done' && img.storagePath)
    .map((img) => img.storagePath as string)

  function canSubmit(): boolean {
    if (!intent || bannedScan.severity === 'hard') return false
    if (
      details.title.trim().length < 3 ||
      !details.categoryId ||
      !details.condition ||
      !details.meetupSpotId
    )
      return false
    if (intent === 'swap' && details.wants.every((w) => w.trim().length === 0)) return false
    if (intent === 'sale' && !details.askPesos.trim()) return false
    return true
  }

  function handleSubmit() {
    if (!intent) return
    setError(null)

    const base = {
      title: details.title,
      description: details.description || undefined,
      categoryId: details.categoryId ?? 0,
      condition: details.condition ?? 'good',
      meetupSpotId: details.meetupSpotId ?? 0,
      images: donePaths,
    }

    const payload =
      intent === 'swap'
        ? {
            ...base,
            intent: 'swap' as const,
            wants: details.wants.map((w) => w.trim()).filter(Boolean),
            acceptsCash: details.acceptsCash,
            estimatedValueCentavos: details.estimatedValuePesos
              ? pesosToCentavos(details.estimatedValuePesos)
              : undefined,
          }
        : intent === 'sale'
          ? {
              ...base,
              intent: 'sale' as const,
              askCentavos: pesosToCentavos(details.askPesos || '0'),
            }
          : { ...base, intent: 'give' as const }

    startTransition(async () => {
      const res = await createListing(listingId, payload)
      if (res.error) setError({ message: res.error, hard: !!res.blockedRule })
    })
  }

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Sheet open onClose={close} title={STEP_TITLES[step]}>
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {INTENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setIntent(opt.value)
                setStep(1)
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '0.25rem',
                padding: '1rem',
                textAlign: 'left',
                border: 'var(--stroke)',
                borderRadius: 'var(--radius)',
                backgroundColor: 'var(--card)',
                boxShadow: 'var(--shadow-hard)',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.125rem',
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}
              >
                {opt.label}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8125rem',
                  color: 'var(--ink-70)',
                }}
              >
                {opt.hint}
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
            {images.map((img) => (
              <div
                key={img.id}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  border: 'var(--stroke)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  backgroundColor: 'var(--paper-dim)',
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.previewUrl}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    opacity: img.status === 'uploading' ? 0.5 : 1,
                  }}
                />
                {img.status === 'error' && (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      color: 'var(--crimson)',
                      backgroundColor: 'rgba(255,255,255,0.8)',
                    }}
                  >
                    Failed
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  aria-label="Remove photo"
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '20px',
                    height: '20px',
                    border: 'var(--stroke)',
                    borderRadius: '50%',
                    backgroundColor: 'var(--card)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Add photo"
                style={{
                  aspectRatio: '1',
                  border: '1.5px dashed var(--ink-45)',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--card)',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  color: 'var(--ink-45)',
                }}
              >
                +
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFilesPicked}
            style={{ display: 'none' }}
          />

          {images.some((img) => img.status === 'done') && !imagesUploading && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              Photo saved.
            </p>
          )}
          {images.length === 0 && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.8125rem',
                color: 'var(--ink-45)',
                margin: 0,
              }}
            >
              Optional, but listings with photos get more offers. Up to 4.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              fullWidth
              disabled={imagesUploading}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {step === 2 && intent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <ListingDetailsFields
            intent={intent}
            categories={categories}
            meetupSpots={meetupSpots}
            value={details}
            onChange={setDetails}
            bannedScan={bannedScan}
          />

          {error && bannedScan.severity !== 'hard' && (
            <Panel style={{ backgroundColor: 'var(--paper-dim)' }}>
              <p
                role="alert"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--crimson)',
                  margin: 0,
                }}
              >
                {error.message}
              </p>
            </Panel>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button type="button" variant="ghost" onClick={() => setStep(1)} disabled={isPending}>
              Back
            </Button>
            {bannedScan.severity === 'hard' ? (
              <Button type="button" variant="primary" fullWidth disabled>
                Blocked
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                fullWidth
                disabled={!canSubmit() || isPending}
                onClick={handleSubmit}
              >
                {isPending ? 'Posting…' : 'Post it'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}
