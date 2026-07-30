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
    }
    Enums: Record<string, never>
  }
}

export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
