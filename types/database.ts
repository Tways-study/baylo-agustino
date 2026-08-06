export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string
          program: string | null
          year_level: number | null
          avatar_url: string | null
          bio: string | null
          verified_at: string | null
          trust_score: number
          show_up_rate: number | null
          completed_deals: number
          is_suspended: boolean
          created_at: string
        }
        Insert: {
          id: string
          display_name: string
          program?: string | null
          year_level?: number | null
          avatar_url?: string | null
          bio?: string | null
          verified_at?: string | null
          trust_score?: number
          show_up_rate?: number | null
          completed_deals?: number
          is_suspended?: boolean
          created_at?: string
        }
        Update: {
          display_name?: string
          program?: string | null
          year_level?: number | null
          avatar_url?: string | null
          bio?: string | null
        }
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      policy_acceptances: {
        Row: {
          id: number
          user_id: string
          policy_version: number
          accepted_at: string
        }
        Insert: {
          user_id: string
          policy_version: number
          accepted_at?: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      blocks: {
        Row: { blocker_id: string; blocked_id: string }
        Insert: { blocker_id: string; blocked_id: string }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      meetup_spots: {
        Row: {
          id: number
          name: string
          hint: string | null
          is_camera_covered: boolean
          active: boolean
        }
        Insert: {
          name: string
          hint?: string | null
          is_camera_covered?: boolean
          active?: boolean
        }
        Update: {
          name?: string
          hint?: string | null
          is_camera_covered?: boolean
          active?: boolean
        }
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      categories: {
        Row: {
          id: number
          slug: string
          name: string
          position: number
        }
        Insert: {
          slug: string
          name: string
          position?: number
        }
        Update: {
          slug?: string
          name?: string
          position?: number
        }
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      listings: {
        Row: {
          id: string
          code: string
          owner_id: string
          intent: ListingIntent
          title: string
          description: string | null
          category_id: number | null
          condition: string | null
          ask_centavos: number | null
          estimated_value_centavos: number | null
          accepts_cash: boolean
          status: ListingStatus
          meetup_spot_id: number | null
          search_tsv: string
          view_count: number
          created_at: string
          bumped_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          code: string
          owner_id: string
          intent: ListingIntent
          title: string
          description?: string | null
          category_id?: number | null
          condition?: string | null
          ask_centavos?: number | null
          estimated_value_centavos?: number | null
          accepts_cash?: boolean
          status?: ListingStatus
          meetup_spot_id?: number | null
          view_count?: number
          created_at?: string
          bumped_at?: string
          expires_at?: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      listing_images: {
        Row: {
          id: string
          listing_id: string
          storage_path: string
          position: number
        }
        Insert: {
          id?: string
          listing_id: string
          storage_path: string
          position?: number
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      listing_wants: {
        Row: {
          id: number
          listing_id: string
          label: string
          position: number
        }
        Insert: {
          listing_id: string
          label: string
          position?: number
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      saved_listings: {
        Row: {
          user_id: string
          listing_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          listing_id: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      search_events: {
        Row: {
          id: number
          user_id: string
          query: string
          created_at: string
        }
        Insert: {
          user_id: string
          query: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      offers: {
        Row: {
          id: string
          listing_id: string
          root_offer_id: string
          from_user_id: string
          to_user_id: string
          parent_offer_id: string | null
          cash_centavos: number
          cash_direction: CashDirection
          note: string | null
          status: OfferStatus
          expires_at: string
          created_at: string
          responded_at: string | null
        }
        Insert: {
          id?: string
          listing_id: string
          root_offer_id: string
          from_user_id: string
          to_user_id: string
          parent_offer_id?: string | null
          cash_centavos?: number
          cash_direction?: CashDirection
          note?: string | null
          status?: OfferStatus
          expires_at?: string
          created_at?: string
          responded_at?: string | null
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      offer_items: {
        Row: {
          root_offer_id: string
          listing_id: string
        }
        Insert: {
          root_offer_id: string
          listing_id: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          offer_id: string | null
          listing_id: string | null
          want_id: string | null
          reason: string | null
          kind: NotificationKind
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          offer_id?: string | null
          listing_id?: string | null
          want_id?: string | null
          reason?: string | null
          kind: NotificationKind
          read_at?: string | null
          created_at?: string
        }
        Update: { read_at?: string | null }
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      meetups: {
        Row: {
          offer_id: string
          spot_id: number
          scheduled_at: string
          proposed_by: string
          confirmed_by_offerer: boolean
          confirmed_by_owner: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          offer_id: string
          spot_id: number
          scheduled_at: string
          proposed_by: string
          confirmed_by_offerer?: boolean
          confirmed_by_owner?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      messages: {
        Row: {
          id: string
          offer_id: string
          sender_id: string
          body: string
          created_at: string
          read_at: string | null
        }
        Insert: {
          id?: string
          offer_id: string
          sender_id: string
          body: string
          created_at?: string
          read_at?: string | null
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      deal_confirmations: {
        Row: {
          offer_id: string
          user_id: string
          confirmed_at: string
        }
        Insert: {
          offer_id: string
          user_id: string
          confirmed_at?: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
      offer_cancellations: {
        Row: {
          offer_id: string
          cancelled_by: string
          reason_code: string
          reason_text: string | null
          was_late: boolean
          created_at: string
        }
        Insert: {
          offer_id: string
          cancelled_by: string
          reason_code: string
          reason_text?: string | null
          was_late: boolean
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: Array<{
          foreignKeyName: string
          columns: string[]
          isOneToOne?: boolean
          referencedRelation: string
          referencedColumns: string[]
        }>
      }
    }
    Views: Record<string, never>
    Functions: {
      check_email_domain: {
        Args: { email: string }
        Returns: boolean
      }
      complete_onboarding: {
        Args: {
          p_display_name: string
          p_program: string | null
          p_year_level: number | null
          p_avatar_url: string | null
          p_policy_version: number
        }
        Returns: undefined
      }
      create_listing: {
        Args: {
          p_id: string
          p_intent: ListingIntent
          p_title: string
          p_description: string | null
          p_category_id: number | null
          p_condition: string | null
          p_ask_centavos: number | null
          p_estimated_value_centavos: number | null
          p_accepts_cash: boolean | null
          p_meetup_spot_id: number | null
          p_wants: string[] | null
          p_image_paths: string[] | null
        }
        Returns: Array<{ id: string; code: string }>
      }
      update_listing: {
        Args: {
          p_id: string
          p_title: string
          p_description: string | null
          p_category_id: number | null
          p_condition: string | null
          p_ask_centavos: number | null
          p_estimated_value_centavos: number | null
          p_accepts_cash: boolean | null
          p_meetup_spot_id: number | null
          p_wants: string[] | null
        }
        Returns: undefined
      }
      archive_listing: {
        Args: { p_id: string }
        Returns: undefined
      }
      bump_listing: {
        Args: { p_id: string }
        Returns: undefined
      }
      increment_listing_view: {
        Args: { p_id: string }
        Returns: undefined
      }
      search_listings_fuzzy: {
        Args: { p_query: string; p_limit?: number }
        Returns: Database['public']['Tables']['listings']['Row'][]
      }
      create_offer: {
        Args: {
          p_listing_id: string
          p_item_listing_ids: string[] | null
          p_cash_centavos: number | null
          p_cash_direction: CashDirection | null
          p_note: string | null
        }
        Returns: string
      }
      counter_offer: {
        Args: {
          p_offer_id: string
          p_cash_centavos: number | null
          p_cash_direction: CashDirection | null
          p_note: string | null
        }
        Returns: string
      }
      accept_offer: {
        Args: { p_offer_id: string }
        Returns: undefined
      }
      decline_offer: {
        Args: { p_offer_id: string }
        Returns: undefined
      }
      withdraw_offer: {
        Args: { p_offer_id: string }
        Returns: undefined
      }
      get_offer_thread: {
        Args: { p_offer_id: string }
        Returns: Database['public']['Tables']['offers']['Row'][]
      }
      propose_meetup: {
        Args: {
          p_offer_id: string
          p_spot_id: number
          p_scheduled_at: string
        }
        Returns: undefined
      }
      confirm_meetup: {
        Args: {
          p_offer_id: string
        }
        Returns: undefined
      }
      mark_swapped: {
        Args: {
          p_offer_id: string
        }
        Returns: undefined
      }
      cancel_deal: {
        Args: {
          p_offer_id: string
          p_reason_code: string
          p_reason_text: string | null
        }
        Returns: undefined
      }
      follow_user: {
        Args: { p_followee_id: string }
        Returns: undefined
      }
      unfollow_user: {
        Args: { p_followee_id: string }
        Returns: undefined
      }
      post_want: {
        Args: {
          p_title: string
          p_details: string | null
          p_budget_centavos: number | null
          p_offering: string | null
        }
        Returns: undefined
      }
      close_want: {
        Args: { p_want_id: string }
        Returns: undefined
      }
      user_is_registered: {
        Args: { p_email: string }
        Returns: boolean
      }
    }
    Enums: {
      listing_intent: ListingIntent
      listing_status: ListingStatus
      offer_status: OfferStatus
    }
  }
}

export type ListingIntent = 'swap' | 'sale' | 'give'
export type ListingStatus = 'draft' | 'active' | 'reserved' | 'completed' | 'archived' | 'removed'
export type OfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'countered'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'completed'
export type CashDirection = 'from_offerer' | 'to_offerer'
export type NotificationKind =
  | 'offer_received'
  | 'offer_countered'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_withdrawn'
  | 'offer_expired'
  | 'meetup_proposed'
  | 'deal_completed'
  | 'deal_cancelled'
  | 'listing_removed'
  | 'account_suspended'
  | 'hanap_match'

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type MeetupSpotRow = Database['public']['Tables']['meetup_spots']['Row']
export type CategoryRow = Database['public']['Tables']['categories']['Row']
export type ListingRow = Database['public']['Tables']['listings']['Row']
export type ListingImageRow = Database['public']['Tables']['listing_images']['Row']
export type ListingWantRow = Database['public']['Tables']['listing_wants']['Row']
export type OfferRow = Database['public']['Tables']['offers']['Row']
export type OfferItemRow = Database['public']['Tables']['offer_items']['Row']
export type NotificationRow = Database['public']['Tables']['notifications']['Row']
export type MeetupRow = Database['public']['Tables']['meetups']['Row']
export type MessageRow = Database['public']['Tables']['messages']['Row']
export type DealConfirmationRow = Database['public']['Tables']['deal_confirmations']['Row']
export type OfferCancellationRow = Database['public']['Tables']['offer_cancellations']['Row']

export interface WantRow {
  id: string
  user_id: string
  title: string
  details: string | null
  budget_centavos: number | null
  offering: string | null
  status: 'open' | 'closed'
  created_at: string
}

export interface FollowRow {
  follower_id: string
  followee_id: string
  created_at: string
}

export interface PulseStatsRow {
  swaps_this_week: number
  top_wanted: string | null
  most_active_program: string | null
}
