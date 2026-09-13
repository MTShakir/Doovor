export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_role: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          business_id: string | null
          entity: string
          entity_id: string | null
          id: string
          ip: unknown
          occurred_at: string
          request_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_role: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          business_id?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          occurred_at?: string
          request_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_role?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          business_id?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip?: unknown
          occurred_at?: string
          request_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          instructor_id: string
          kind: Database["public"]["Enums"]["exception_kind"]
          period: unknown
          reason: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          instructor_id: string
          kind: Database["public"]["Enums"]["exception_kind"]
          period?: unknown
          reason?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          instructor_id?: string
          kind?: Database["public"]["Enums"]["exception_kind"]
          period?: unknown
          reason?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_exceptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_exceptions_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      badge_reminders: {
        Row: {
          badge_expiry: string
          created_at: string
          days_before: number
          instructor_id: string
        }
        Insert: {
          badge_expiry: string
          created_at?: string
          days_before: number
          instructor_id: string
        }
        Update: {
          badge_expiry?: string
          created_at?: string
          days_before?: number
          instructor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "badge_reminders_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_recurrences: {
        Row: {
          booked_until: string | null
          business_id: string
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number
          ends_on: string | null
          id: string
          instructor_id: string
          learner_id: string
          lesson_type_id: string
          local_time: string
          pickup_point_id: string | null
          starts_on: string
          updated_at: string
          weekday: number
        }
        Insert: {
          booked_until?: string | null
          business_id: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes: number
          ends_on?: string | null
          id?: string
          instructor_id: string
          learner_id: string
          lesson_type_id: string
          local_time: string
          pickup_point_id?: string | null
          starts_on: string
          updated_at?: string
          weekday: number
        }
        Update: {
          booked_until?: string | null
          business_id?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number
          ends_on?: string | null
          id?: string
          instructor_id?: string
          learner_id?: string
          lesson_type_id?: string
          local_time?: string
          pickup_point_id?: string | null
          starts_on?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_recurrences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_recurrences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_recurrences_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "booking_recurrences_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_recurrences_lesson_type_id_business_id_fkey"
            columns: ["lesson_type_id", "business_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "booking_recurrences_pickup_point_id_fkey"
            columns: ["pickup_point_id"]
            isOneToOne: false
            referencedRelation: "pickup_points"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          blocked_range: unknown
          buffer_minutes: number
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string | null
          credit_minutes: number
          ends_at: string
          expires_at: string | null
          fee_pence: number | null
          hold_expires_at: string | null
          id: string
          instructor_id: string
          late_cancellation: boolean | null
          learner_id: string
          learner_range: unknown
          lesson_type_id: string
          payment_mode: Database["public"]["Enums"]["booking_payment_mode"]
          payment_status: Database["public"]["Enums"]["booking_payment_status"]
          pickup_point_id: string | null
          price_pence: number
          recurrence_id: string | null
          source: Database["public"]["Enums"]["booking_source"]
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          vehicle_id: string | null
          version: number
        }
        Insert: {
          blocked_range: unknown
          buffer_minutes: number
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_minutes?: number
          ends_at: string
          expires_at?: string | null
          fee_pence?: number | null
          hold_expires_at?: string | null
          id?: string
          instructor_id: string
          late_cancellation?: boolean | null
          learner_id: string
          learner_range: unknown
          lesson_type_id: string
          payment_mode?: Database["public"]["Enums"]["booking_payment_mode"]
          payment_status?: Database["public"]["Enums"]["booking_payment_status"]
          pickup_point_id?: string | null
          price_pence: number
          recurrence_id?: string | null
          source: Database["public"]["Enums"]["booking_source"]
          starts_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          vehicle_id?: string | null
          version?: number
        }
        Update: {
          blocked_range?: unknown
          buffer_minutes?: number
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_minutes?: number
          ends_at?: string
          expires_at?: string | null
          fee_pence?: number | null
          hold_expires_at?: string | null
          id?: string
          instructor_id?: string
          late_cancellation?: boolean | null
          learner_id?: string
          learner_range?: unknown
          lesson_type_id?: string
          payment_mode?: Database["public"]["Enums"]["booking_payment_mode"]
          payment_status?: Database["public"]["Enums"]["booking_payment_status"]
          pickup_point_id?: string | null
          price_pence?: number
          recurrence_id?: string | null
          source?: Database["public"]["Enums"]["booking_source"]
          starts_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          vehicle_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "bookings_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_lesson_type_id_business_id_fkey"
            columns: ["lesson_type_id", "business_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "bookings_pickup_point_id_fkey"
            columns: ["pickup_point_id"]
            isOneToOne: false
            referencedRelation: "pickup_points"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: Json | null
          base_location: unknown
          base_postcode: string | null
          created_at: string
          created_by: string | null
          founding_offer: boolean
          id: string
          logo_url: string | null
          name: string
          plan: Database["public"]["Enums"]["plan_key"]
          plan_expires_at: string | null
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["business_status"]
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          timezone: string
          type: Database["public"]["Enums"]["business_type"]
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          address?: Json | null
          base_location?: unknown
          base_postcode?: string | null
          created_at?: string
          created_by?: string | null
          founding_offer?: boolean
          id?: string
          logo_url?: string | null
          name: string
          plan?: Database["public"]["Enums"]["plan_key"]
          plan_expires_at?: string | null
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["business_status"]
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          timezone?: string
          type: Database["public"]["Enums"]["business_type"]
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          address?: Json | null
          base_location?: unknown
          base_postcode?: string | null
          created_at?: string
          created_by?: string | null
          founding_offer?: boolean
          id?: string
          logo_url?: string | null
          name?: string
          plan?: Database["public"]["Enums"]["plan_key"]
          plan_expires_at?: string | null
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["business_status"]
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          timezone?: string
          type?: Database["public"]["Enums"]["business_type"]
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coverage_districts: {
        Row: {
          business_id: string
          created_at: string
          instructor_id: string
          outcode: string
          rule: Database["public"]["Enums"]["coverage_rule"]
        }
        Insert: {
          business_id: string
          created_at?: string
          instructor_id: string
          outcode: string
          rule: Database["public"]["Enums"]["coverage_rule"]
        }
        Update: {
          business_id?: string
          created_at?: string
          instructor_id?: string
          outcode?: string
          rule?: Database["public"]["Enums"]["coverage_rule"]
        }
        Relationships: [
          {
            foreignKeyName: "coverage_districts_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          reason: string | null
          requested_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_profiles: {
        Row: {
          badge_expiry: string | null
          badge_number: string | null
          badge_path: string | null
          base_location: unknown
          base_postcode: string | null
          bio: string | null
          buffer_minutes: number
          business_id: string
          car_make: string | null
          car_model: string | null
          created_at: string
          dbs_confirmed_at: string | null
          display_name: string
          dual_controls: boolean
          id: string
          instant_book: boolean
          is_listed: boolean
          languages: string[]
          onboarding_completed_at: string | null
          onboarding_step: number
          photo_path: string | null
          public_slug: string | null
          qualification: Database["public"]["Enums"]["instructor_qualification"]
          radius_miles: number
          specialisms: string[]
          supervisor_business_id: string | null
          supervisor_instructor_id: string | null
          transmission: Database["public"]["Enums"]["transmission"]
          updated_at: string
          user_id: string
          verification_decision_reason: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
          verification_submitted_at: string | null
          verified_at: string | null
          years_teaching: number | null
        }
        Insert: {
          badge_expiry?: string | null
          badge_number?: string | null
          badge_path?: string | null
          base_location?: unknown
          base_postcode?: string | null
          bio?: string | null
          buffer_minutes?: number
          business_id: string
          car_make?: string | null
          car_model?: string | null
          created_at?: string
          dbs_confirmed_at?: string | null
          display_name: string
          dual_controls?: boolean
          id?: string
          instant_book?: boolean
          is_listed?: boolean
          languages?: string[]
          onboarding_completed_at?: string | null
          onboarding_step?: number
          photo_path?: string | null
          public_slug?: string | null
          qualification?: Database["public"]["Enums"]["instructor_qualification"]
          radius_miles?: number
          specialisms?: string[]
          supervisor_business_id?: string | null
          supervisor_instructor_id?: string | null
          transmission?: Database["public"]["Enums"]["transmission"]
          updated_at?: string
          user_id: string
          verification_decision_reason?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verification_submitted_at?: string | null
          verified_at?: string | null
          years_teaching?: number | null
        }
        Update: {
          badge_expiry?: string | null
          badge_number?: string | null
          badge_path?: string | null
          base_location?: unknown
          base_postcode?: string | null
          bio?: string | null
          buffer_minutes?: number
          business_id?: string
          car_make?: string | null
          car_model?: string | null
          created_at?: string
          dbs_confirmed_at?: string | null
          display_name?: string
          dual_controls?: boolean
          id?: string
          instant_book?: boolean
          is_listed?: boolean
          languages?: string[]
          onboarding_completed_at?: string | null
          onboarding_step?: number
          photo_path?: string | null
          public_slug?: string | null
          qualification?: Database["public"]["Enums"]["instructor_qualification"]
          radius_miles?: number
          specialisms?: string[]
          supervisor_business_id?: string | null
          supervisor_instructor_id?: string | null
          transmission?: Database["public"]["Enums"]["transmission"]
          updated_at?: string
          user_id?: string
          verification_decision_reason?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verification_submitted_at?: string | null
          verified_at?: string | null
          years_teaching?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "instructor_profiles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_profiles_supervisor_business_id_fkey"
            columns: ["supervisor_business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_profiles_supervisor_instructor_id_fkey"
            columns: ["supervisor_instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          business_id: string
          channel: string
          created_at: string
          email: string | null
          expires_at: string
          full_name: string | null
          id: string
          instructor_id: string | null
          invited_by: string
          kind: string
          phone: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["membership_role"] | null
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id: string
          channel: string
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          instructor_id?: string | null
          invited_by: string
          kind: string
          phone?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"] | null
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          business_id?: string
          channel?: string
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          instructor_id?: string | null
          invited_by?: string
          kind?: string
          phone?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["membership_role"] | null
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_notes: {
        Row: {
          author_id: string
          body: string
          business_id: string
          created_at: string
          id: string
          learner_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          business_id: string
          created_at?: string
          id?: string
          learner_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          business_id?: string
          created_at?: string
          id?: string
          learner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_notes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_notes_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_private: {
        Row: {
          created_at: string
          date_of_birth: string | null
          licence_number_encrypted: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          licence_number_encrypted?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          licence_number_encrypted?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_profiles: {
        Row: {
          created_at: string
          experience_level:
            | Database["public"]["Enums"]["experience_level"]
            | null
          location: unknown
          postcode: string | null
          provisional_licence_confirmed: boolean
          transmission:
            | Database["public"]["Enums"]["learner_transmission"]
            | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          location?: unknown
          postcode?: string | null
          provisional_licence_confirmed?: boolean
          transmission?:
            | Database["public"]["Enums"]["learner_transmission"]
            | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          experience_level?:
            | Database["public"]["Enums"]["experience_level"]
            | null
          location?: unknown
          postcode?: string | null
          provisional_licence_confirmed?: boolean
          transmission?:
            | Database["public"]["Enums"]["learner_transmission"]
            | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learner_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_relationships: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          instructor_id: string | null
          learner_id: string
          source: Database["public"]["Enums"]["learner_source"]
          status: Database["public"]["Enums"]["learner_status"]
          updated_at: string
          usual_duration_minutes: number | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          instructor_id?: string | null
          learner_id: string
          source?: Database["public"]["Enums"]["learner_source"]
          status?: Database["public"]["Enums"]["learner_status"]
          updated_at?: string
          usual_duration_minutes?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          instructor_id?: string | null
          learner_id?: string
          source?: Database["public"]["Enums"]["learner_source"]
          status?: Database["public"]["Enums"]["learner_status"]
          updated_at?: string
          usual_duration_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learner_relationships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_relationships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_relationships_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "learner_relationships_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_prices: {
        Row: {
          business_id: string
          created_at: string
          duration_minutes: number
          id: string
          instructor_id: string | null
          lesson_type_id: string
          price_pence: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          duration_minutes: number
          id?: string
          instructor_id?: string | null
          lesson_type_id: string
          price_pence: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          instructor_id?: string | null
          lesson_type_id?: string
          price_pence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_prices_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "lesson_prices_lesson_type_id_business_id_fkey"
            columns: ["lesson_type_id", "business_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      lesson_types: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["lesson_kind"]
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["lesson_kind"]
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["lesson_kind"]
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_types_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          business_id: string
          created_at: string
          id: string
          invited_by: string | null
          permissions: Json
          role: Database["public"]["Enums"]["membership_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          invited_by?: string | null
          permissions?: Json
          role: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          invited_by?: string | null
          permissions?: Json
          role?: Database["public"]["Enums"]["membership_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: Database["public"]["Enums"]["notification_category"]
          channel: Database["public"]["Enums"]["notification_channel"]
          enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["notification_category"]
          channel: Database["public"]["Enums"]["notification_channel"]
          enabled: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["notification_category"]
          channel?: Database["public"]["Enums"]["notification_channel"]
          enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attempts: number
          body: string
          business_id: string | null
          category: Database["public"]["Enums"]["notification_category"]
          channels: Database["public"]["Enums"]["notification_channel"][]
          created_at: string
          dedupe_key: string
          entity_id: string | null
          entity_type: string | null
          id: string
          kind: string
          last_error: string | null
          link: string | null
          read_at: string | null
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body: string
          business_id?: string | null
          category: Database["public"]["Enums"]["notification_category"]
          channels?: Database["public"]["Enums"]["notification_channel"][]
          created_at?: string
          dedupe_key: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind: string
          last_error?: string | null
          link?: string | null
          read_at?: string | null
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string
          business_id?: string | null
          category?: Database["public"]["Enums"]["notification_category"]
          channels?: Database["public"]["Enums"]["notification_channel"][]
          created_at?: string
          dedupe_key?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          link?: string | null
          read_at?: string | null
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          name: string
          payload: Json
          sent_at: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          name: string
          payload?: Json
          sent_at?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          name?: string
          payload?: Json
          sent_at?: string | null
        }
        Relationships: []
      }
      packages: {
        Row: {
          business_id: string
          created_at: string
          expiry_days: number | null
          id: string
          is_active: boolean
          lesson_type_id: string | null
          minutes: number
          name: string
          price_pence: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          expiry_days?: number | null
          id?: string
          is_active?: boolean
          lesson_type_id?: string | null
          minutes: number
          name: string
          price_pence: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          expiry_days?: number | null
          id?: string
          is_active?: boolean
          lesson_type_id?: string | null
          minutes?: number
          name?: string
          price_pence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packages_lesson_type_id_business_id_fkey"
            columns: ["lesson_type_id", "business_id"]
            isOneToOne: false
            referencedRelation: "lesson_types"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      pickup_points: {
        Row: {
          address: string
          business_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_default: boolean
          kind: Database["public"]["Enums"]["pickup_kind"]
          label: string
          learner_id: string
          location: unknown
          postcode: string | null
          updated_at: string
        }
        Insert: {
          address: string
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["pickup_kind"]
          label: string
          learner_id: string
          location?: unknown
          postcode?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          business_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_default?: boolean
          kind?: Database["public"]["Enums"]["pickup_kind"]
          label?: string
          learner_id?: string
          location?: unknown
          postcode?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_points_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_points_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_points_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          created_at: string
          description: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      platform_staff: {
        Row: {
          created_at: string
          created_by: string | null
          role: Database["public"]["Enums"]["platform_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      postcodes: {
        Row: {
          admin_district: string | null
          area: string
          country: string | null
          created_at: string
          fetched_at: string
          latitude: number
          location: unknown
          longitude: number
          outcode: string
          postcode: string
          region: string | null
          updated_at: string
        }
        Insert: {
          admin_district?: string | null
          area: string
          country?: string | null
          created_at?: string
          fetched_at?: string
          latitude: number
          location?: unknown
          longitude: number
          outcode: string
          postcode: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          admin_district?: string | null
          area?: string
          country?: string | null
          created_at?: string
          fetched_at?: string
          latitude?: number
          location?: unknown
          longitude?: number
          outcode?: string
          postcode?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          hits: number
          key: string
          window_started_at: string
        }
        Insert: {
          hits?: number
          key: string
          window_started_at: string
        }
        Update: {
          hits?: number
          key?: string
          window_started_at?: string
        }
        Relationships: []
      }
      sms_usage: {
        Row: {
          business_id: string
          month: string
          sent: number
          updated_at: string
        }
        Insert: {
          business_id: string
          month: string
          sent?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          month?: string
          sent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_usage_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          analytics_consent: boolean
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          email_verified_at: string | null
          full_name: string
          id: string
          intended_role: Database["public"]["Enums"]["intended_role"] | null
          locale: string
          marketing_consent: boolean
          marketing_consent_at: string | null
          phone: string | null
          phone_verified_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          analytics_consent?: boolean
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_verified_at?: string | null
          full_name?: string
          id: string
          intended_role?: Database["public"]["Enums"]["intended_role"] | null
          locale?: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          analytics_consent?: boolean
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          email_verified_at?: string | null
          full_name?: string
          id?: string
          intended_role?: Database["public"]["Enums"]["intended_role"] | null
          locale?: string
          marketing_consent?: boolean
          marketing_consent_at?: string | null
          phone?: string | null
          phone_verified_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      working_hours: {
        Row: {
          business_id: string
          created_at: string
          end_time: string
          id: string
          instructor_id: string
          minutes_range: unknown
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          business_id: string
          created_at?: string
          end_time: string
          id?: string
          instructor_id: string
          minutes_range?: unknown
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          business_id?: string
          created_at?: string
          end_time?: string
          id?: string
          instructor_id?: string
          minutes_range?: unknown
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "working_hours_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Views: {
      learner_card: {
        Row: {
          avatar_url: string | null
          business_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          instructor_id: string | null
          instructor_name: string | null
          last_lesson_at: string | null
          learner_id: string | null
          lessons_taken: number | null
          minutes_taught: number | null
          next_lesson_at: string | null
          phone: string | null
          pickup_points: Json | null
          postcode: string | null
          source: Database["public"]["Enums"]["learner_source"] | null
          status: Database["public"]["Enums"]["learner_status"] | null
          transmission:
            | Database["public"]["Enums"]["learner_transmission"]
            | null
          usual_duration_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learner_relationships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_relationships_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "learner_relationships_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      learner_list: {
        Row: {
          avatar_url: string | null
          business_id: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          instructor_id: string | null
          instructor_name: string | null
          last_lesson_at: string | null
          learner_id: string | null
          lessons_taken: number | null
          next_lesson_at: string | null
          phone: string | null
          postcode: string | null
          search_text: string | null
          source: Database["public"]["Enums"]["learner_source"] | null
          status: Database["public"]["Enums"]["learner_status"] | null
          transmission:
            | Database["public"]["Enums"]["learner_transmission"]
            | null
          usual_duration_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learner_relationships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learner_relationships_instructor_id_business_id_fkey"
            columns: ["instructor_id", "business_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "learner_relationships_learner_id_fkey"
            columns: ["learner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      add_learner: {
        Args: {
          p_instructor_id: string
          p_learner_id: string
          p_postcode?: string
          p_source?: string
          p_transmission?: string
          p_usual_minutes?: number
        }
        Returns: string
      }
      assign_learner: {
        Args: { p_instructor_id: string; p_learner_id: string }
        Returns: string
      }
      book_weekly: {
        Args: {
          p_duration_minutes: number
          p_first_starts_at: string
          p_instructor_id: string
          p_learner_id: string
          p_lesson_type_id: string
          p_open_ended?: boolean
          p_pickup_point_id?: string
          p_weeks: number
        }
        Returns: {
          booking_id: string
          problem: string
          starts_at: string
        }[]
      }
      booking_page: { Args: { p_slug: string }; Returns: Json }
      cache_postcode: {
        Args: {
          p_country?: string
          p_district?: string
          p_latitude: number
          p_longitude: number
          p_outcode: string
          p_postcode: string
        }
        Returns: undefined
      }
      cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      complete_booking: { Args: { p_booking_id: string }; Returns: string }
      covers_postcode: {
        Args: { p_instructor_id: string; p_postcode: string }
        Returns: boolean
      }
      create_booking: {
        Args: {
          p_duration_minutes: number
          p_instructor_id: string
          p_learner_id: string
          p_lesson_type_id: string
          p_pickup_point_id?: string
          p_starts_at: string
        }
        Returns: string
      }
      create_business: {
        Args: {
          p_name: string
          p_type: Database["public"]["Enums"]["business_type"]
        }
        Returns: string
      }
      decide_booking_request: {
        Args: { p_accept: boolean; p_booking_id: string; p_reason?: string }
        Returns: string
      }
      decide_verification: {
        Args: { p_approved: boolean; p_profile_id: string; p_reason?: string }
        Returns: Database["public"]["Enums"]["verification_status"]
      }
      invitation_details: {
        Args: { p_token: string }
        Returns: {
          business_name: string
          email: string
          expired: boolean
          full_name: string
          instructor_name: string
        }[]
      }
      invite_learner: {
        Args: {
          p_channel: string
          p_email?: string
          p_full_name?: string
          p_instructor_id: string
          p_phone?: string
        }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      learner_history: {
        Args: { p_learner_id: string }
        Returns: {
          action: string
          actor_name: string
          after: Json
          before: Json
          happened_at: string
        }[]
      }
      list_my_sessions: {
        Args: never
        Returns: {
          aal: string
          created_at: string
          id: string
          ip: string
          is_current: boolean
          last_active_at: string
          user_agent: string
        }[]
      }
      mark_no_show: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      open_slots: {
        Args: {
          p_date: string
          p_duration_minutes: number
          p_except_booking_id?: string
          p_instructor_id: string
        }
        Returns: string[]
      }
      request_account_deletion: { Args: { p_reason?: string }; Returns: string }
      reschedule_booking: {
        Args: {
          p_booking_id: string
          p_duration_minutes?: number
          p_starts_at: string
        }
        Returns: string
      }
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean }
      set_availability_exception: {
        Args: {
          p_ends_at: string
          p_instructor_id: string
          p_kind: Database["public"]["Enums"]["exception_kind"]
          p_reason?: string
          p_starts_at: string
        }
        Returns: string
      }
      set_booking_rules: {
        Args: { p_business_id: string; p_rules: Json }
        Returns: Json
      }
      set_learner_status: {
        Args: { p_learner_id: string; p_reason?: string; p_status: string }
        Returns: Database["public"]["Enums"]["learner_status"]
      }
      set_onboarding_prices: {
        Args: {
          p_business_id: string
          p_hourly_price_pence: number
          p_package_price_pence?: number
        }
        Returns: string
      }
      set_supervisor: {
        Args: { p_instructor_id: string; p_supervised: boolean }
        Returns: boolean
      }
      set_working_hours: {
        Args: {
          p_end_time: string
          p_instructor_id: string
          p_start_time: string
          p_weekdays: number[]
        }
        Returns: number
      }
      slot_problem: {
        Args: {
          p_duration_minutes: number
          p_instructor_id: string
          p_starts_at: string
        }
        Returns: string
      }
      stop_recurrence: { Args: { p_recurrence_id: string }; Returns: undefined }
      submit_verification: {
        Args: {
          p_badge_expiry: string
          p_badge_number: string
          p_badge_path?: string
          p_dbs_confirmed: boolean
          p_profile_id: string
          p_qualification: Database["public"]["Enums"]["instructor_qualification"]
        }
        Returns: Database["public"]["Enums"]["verification_status"]
      }
      system_booking_notice: { Args: { p_booking_id: string }; Returns: Json }
      system_claim_badge_reminders: {
        Args: { p_today?: string }
        Returns: {
          badge_expiry: string
          business_id: string
          days_before: number
          days_left: number
          instructor_id: string
        }[]
      }
      system_claim_notifications: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          business_id: string
          business_plan: string
          category: Database["public"]["Enums"]["notification_category"]
          channels: Database["public"]["Enums"]["notification_channel"][]
          dedupe_key: string
          email: string
          full_name: string
          id: string
          kind: string
          link: string
          phone: string
          title: string
          user_id: string
        }[]
      }
      system_claim_outbox_events: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          name: string
          payload: Json
          sent_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "outbox_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      system_claim_sms: {
        Args: { p_allowance: number; p_business_id: string }
        Returns: boolean
      }
      system_clear_expired_invitations: {
        Args: { p_older_than?: string }
        Returns: number
      }
      system_clear_rate_limits: {
        Args: { p_older_than?: string }
        Returns: number
      }
      system_drop_push_target: { Args: { p_id: string }; Returns: number }
      system_due_reminders: { Args: { p_within_hours?: number }; Returns: Json }
      system_expire_requests: { Args: never; Returns: number }
      system_extend_recurrences: { Args: { p_weeks?: number }; Returns: number }
      system_mark_notification_failed: {
        Args: { p_error: string; p_id: string }
        Returns: number
      }
      system_mark_notifications_sent: {
        Args: { p_ids: string[] }
        Returns: number
      }
      system_mark_outbox_failed: {
        Args: { p_error: string; p_ids: string[] }
        Returns: number
      }
      system_mark_outbox_sent: { Args: { p_ids: string[] }; Returns: number }
      system_notification_mutes: {
        Args: {
          p_category: Database["public"]["Enums"]["notification_category"]
          p_user_ids: string[]
        }
        Returns: {
          channel: Database["public"]["Enums"]["notification_channel"]
          user_id: string
        }[]
      }
      system_notify: { Args: { p_rows: Json }; Returns: number }
      system_push_targets: {
        Args: { p_user_id: string }
        Returns: {
          auth: string
          endpoint: string
          id: string
          p256dh: string
        }[]
      }
      system_rate_limit_hit: {
        Args: {
          p_action: string
          p_max: number
          p_who: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      system_release_sms: {
        Args: { p_business_id: string }
        Returns: undefined
      }
      system_touch_push_target: { Args: { p_id: string }; Returns: undefined }
      system_unlist_expired_badges: {
        Args: { p_today?: string }
        Returns: number
      }
    }
    Enums: {
      booking_payment_mode:
        | "at_booking"
        | "before_lesson"
        | "after_lesson"
        | "credit"
        | "offline"
      booking_payment_status:
        | "unpaid"
        | "pending"
        | "paid_card"
        | "paid_cash"
        | "paid_bank"
        | "paid_credit"
        | "refunded"
        | "partially_refunded"
        | "failed"
      booking_source:
        | "instructor"
        | "self"
        | "marketplace"
        | "gap_fill"
        | "import"
      booking_status:
        | "pending_payment"
        | "requested"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "declined"
        | "expired"
      business_status: "pending" | "active" | "suspended"
      business_type: "independent" | "school"
      coverage_rule: "include" | "exclude"
      exception_kind: "open" | "blocked"
      experience_level: "none" | "some" | "test_booked"
      instructor_qualification: "adi" | "pdi"
      intended_role: "learner" | "instructor" | "school"
      learner_source: "invite" | "marketplace" | "import" | "manual"
      learner_status:
        | "enquiry"
        | "waiting"
        | "active"
        | "test_booked"
        | "passed"
        | "left"
      learner_transmission: "manual" | "automatic"
      lesson_kind:
        | "standard"
        | "test_prep"
        | "mock_test"
        | "motorway"
        | "intensive"
        | "test_day"
        | "custom"
      membership_role: "owner" | "manager" | "instructor"
      membership_status: "invited" | "active" | "deactivated"
      notification_category: "bookings" | "reminders" | "money" | "account"
      notification_channel: "in_app" | "email" | "push" | "sms"
      pickup_kind: "home" | "school" | "work" | "custom"
      plan_key: "free" | "pro" | "school"
      platform_role: "super_admin" | "support_admin"
      transmission: "manual" | "automatic" | "both"
      verification_status: "unsubmitted" | "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      booking_payment_mode: [
        "at_booking",
        "before_lesson",
        "after_lesson",
        "credit",
        "offline",
      ],
      booking_payment_status: [
        "unpaid",
        "pending",
        "paid_card",
        "paid_cash",
        "paid_bank",
        "paid_credit",
        "refunded",
        "partially_refunded",
        "failed",
      ],
      booking_source: [
        "instructor",
        "self",
        "marketplace",
        "gap_fill",
        "import",
      ],
      booking_status: [
        "pending_payment",
        "requested",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "declined",
        "expired",
      ],
      business_status: ["pending", "active", "suspended"],
      business_type: ["independent", "school"],
      coverage_rule: ["include", "exclude"],
      exception_kind: ["open", "blocked"],
      experience_level: ["none", "some", "test_booked"],
      instructor_qualification: ["adi", "pdi"],
      intended_role: ["learner", "instructor", "school"],
      learner_source: ["invite", "marketplace", "import", "manual"],
      learner_status: [
        "enquiry",
        "waiting",
        "active",
        "test_booked",
        "passed",
        "left",
      ],
      learner_transmission: ["manual", "automatic"],
      lesson_kind: [
        "standard",
        "test_prep",
        "mock_test",
        "motorway",
        "intensive",
        "test_day",
        "custom",
      ],
      membership_role: ["owner", "manager", "instructor"],
      membership_status: ["invited", "active", "deactivated"],
      notification_category: ["bookings", "reminders", "money", "account"],
      notification_channel: ["in_app", "email", "push", "sms"],
      pickup_kind: ["home", "school", "work", "custom"],
      plan_key: ["free", "pro", "school"],
      platform_role: ["super_admin", "support_admin"],
      transmission: ["manual", "automatic", "both"],
      verification_status: ["unsubmitted", "pending", "approved", "rejected"],
    },
  },
} as const

