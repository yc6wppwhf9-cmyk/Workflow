export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          department: string | null
          field_changed: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          product_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          department?: string | null
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          product_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          department?: string | null
          field_changed?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          product_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_data: {
        Row: {
          cost_given: boolean
          fg_inv_code: string | null
          id: string
          is_completed: boolean
          is_locked: boolean
          items: Json[] | null
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cost_given?: boolean
          fg_inv_code?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          items?: Json[] | null
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cost_given?: boolean
          fg_inv_code?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          items?: Json[] | null
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_data_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_data: {
        Row: {
          add_on_1: string | null
          add_on_2: string | null
          add_on_3: string | null
          air_mesh: string | null
          assigned_to: string | null
          bartech: string | null
          branding: string | null
          channel: string | null
          color_skus: string[] | null
          designer_name: string | null
          designer_sign: string | null
          digital_print: string | null
          fabric: string | null
          farma: string | null
          head_notes: string | null
          id: string
          is_completed: boolean
          is_locked: boolean
          lader_lock: string | null
          lining: string | null
          patta_1: string | null
          patta_2: string | null
          patta_9mm: string | null
          product_id: string
          puller: string | null
          re_sampling_by: string | null
          remarks: string | null
          sample_color: string | null
          screen_print: string | null
          season_year: string | null
          style_name: string | null
          techpack_pdf_url: string | null
          unique_feature: string | null
          updated_at: string
          updated_by: string | null
          zipper: string | null
        }
        Insert: {
          add_on_1?: string | null
          add_on_2?: string | null
          add_on_3?: string | null
          air_mesh?: string | null
          assigned_to?: string | null
          bartech?: string | null
          branding?: string | null
          channel?: string | null
          color_skus?: string[] | null
          designer_name?: string | null
          designer_sign?: string | null
          digital_print?: string | null
          fabric?: string | null
          farma?: string | null
          head_notes?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          lader_lock?: string | null
          lining?: string | null
          patta_1?: string | null
          patta_2?: string | null
          patta_9mm?: string | null
          product_id: string
          puller?: string | null
          re_sampling_by?: string | null
          remarks?: string | null
          sample_color?: string | null
          screen_print?: string | null
          season_year?: string | null
          style_name?: string | null
          techpack_pdf_url?: string | null
          unique_feature?: string | null
          updated_at?: string
          updated_by?: string | null
          zipper?: string | null
        }
        Update: {
          add_on_1?: string | null
          add_on_2?: string | null
          add_on_3?: string | null
          air_mesh?: string | null
          assigned_to?: string | null
          bartech?: string | null
          branding?: string | null
          channel?: string | null
          color_skus?: string[] | null
          designer_name?: string | null
          designer_sign?: string | null
          digital_print?: string | null
          fabric?: string | null
          farma?: string | null
          head_notes?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          lader_lock?: string | null
          lining?: string | null
          patta_1?: string | null
          patta_2?: string | null
          patta_9mm?: string | null
          product_id?: string
          puller?: string | null
          re_sampling_by?: string | null
          remarks?: string | null
          sample_color?: string | null
          screen_print?: string | null
          season_year?: string | null
          style_name?: string | null
          techpack_pdf_url?: string | null
          unique_feature?: string | null
          updated_at?: string
          updated_by?: string | null
          zipper?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_data_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_data_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_submissions: {
        Row: {
          created_at: string
          feedback: string | null
          id: string
          product_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          id?: string
          product_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          id?: string
          product_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_submissions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_master: {
        Row: {
          id: string
          inv_code: string
          item_name: string
          item_name_norm: string
          uom: string | null
        }
        Insert: {
          id?: string
          inv_code: string
          item_name: string
          item_name_norm: string
          uom?: string | null
        }
        Update: {
          id?: string
          inv_code?: string
          item_name?: string
          item_name_norm?: string
          uom?: string | null
        }
        Relationships: []
      }
      marketing_data: {
        Row: {
          catalogs: string[] | null
          hero_product: boolean
          id: string
          is_completed: boolean
          is_locked: boolean
          launch_creatives: string | null
          photoshoots: string | null
          product_features: string[] | null
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          catalogs?: string[] | null
          hero_product?: boolean
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          launch_creatives?: string | null
          photoshoots?: string | null
          product_features?: string[] | null
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          catalogs?: string[] | null
          hero_product?: boolean
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          launch_creatives?: string | null
          photoshoots?: string | null
          product_features?: string[] | null
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_data_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      merchandising_data: {
        Row: {
          assigned_to: string | null
          attribute_sheet_handed_over: boolean
          back_padded: string | null
          bottle_slot: string | null
          character_name: string | null
          color_code: string | null
          colour_variants: Json | null
          compartments: string | null
          dimensions: Json | null
          height: string | null
          id: string
          is_completed: boolean
          is_locked: boolean
          laptop_compartment: string | null
          main_compartments: string | null
          main_material: string | null
          material_spec: string | null
          materials: string[] | null
          number_of_zips: string | null
          pocket_compartments: string | null
          product_id: string
          production_fields: Json | null
          rain_cover: string | null
          season_year: string | null
          theme: string | null
          unique_purpose: string | null
          updated_at: string
          updated_by: string | null
          volume: string | null
          weight: string | null
        }
        Insert: {
          assigned_to?: string | null
          attribute_sheet_handed_over?: boolean
          back_padded?: string | null
          bottle_slot?: string | null
          character_name?: string | null
          color_code?: string | null
          colour_variants?: Json | null
          compartments?: string | null
          dimensions?: Json | null
          height?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          laptop_compartment?: string | null
          main_compartments?: string | null
          main_material?: string | null
          material_spec?: string | null
          materials?: string[] | null
          number_of_zips?: string | null
          pocket_compartments?: string | null
          product_id: string
          production_fields?: Json | null
          rain_cover?: string | null
          season_year?: string | null
          theme?: string | null
          unique_purpose?: string | null
          updated_at?: string
          updated_by?: string | null
          volume?: string | null
          weight?: string | null
        }
        Update: {
          assigned_to?: string | null
          attribute_sheet_handed_over?: boolean
          back_padded?: string | null
          bottle_slot?: string | null
          character_name?: string | null
          color_code?: string | null
          colour_variants?: Json | null
          compartments?: string | null
          dimensions?: Json | null
          height?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          laptop_compartment?: string | null
          main_compartments?: string | null
          main_material?: string | null
          material_spec?: string | null
          materials?: string[] | null
          number_of_zips?: string | null
          pocket_compartments?: string | null
          product_id?: string
          production_fields?: Json | null
          rain_cover?: string | null
          season_year?: string | null
          theme?: string | null
          unique_purpose?: string | null
          updated_at?: string
          updated_by?: string | null
          volume?: string | null
          weight?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchandising_data_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandising_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchandising_data_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_files: {
        Row: {
          colour_tag: string | null
          created_at: string
          department: Database["public"]["Enums"]["user_role"] | null
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          name: string
          product_id: string
          review_feedback: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          uploaded_by: string | null
        }
        Insert: {
          colour_tag?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["user_role"] | null
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          name: string
          product_id: string
          review_feedback?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          uploaded_by?: string | null
        }
        Update: {
          colour_tag?: string | null
          created_at?: string
          department?: Database["public"]["Enums"]["user_role"] | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          name?: string
          product_id?: string
          review_feedback?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_files_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_files_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          display_name: string | null
          id: string
          is_locked: boolean
          name: string
          sku: string
          sub_category: string | null
          updated_at: string
          updated_by: string | null
          workflow_stage: Database["public"]["Enums"]["workflow_stage"]
        }
        Insert: {
          brand?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_locked?: boolean
          name: string
          sku: string
          sub_category?: string | null
          updated_at?: string
          updated_by?: string | null
          workflow_stage?: Database["public"]["Enums"]["workflow_stage"]
        }
        Update: {
          brand?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_name?: string | null
          id?: string
          is_locked?: boolean
          name?: string
          sku?: string
          sub_category?: string | null
          updated_at?: string
          updated_by?: string | null
          workflow_stage?: Database["public"]["Enums"]["workflow_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          must_change_password: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          must_change_password?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sales_data: {
        Row: {
          assign_to: string | null
          channel: string | null
          deadline_date: string | null
          dealer_pricing: number | null
          id: string
          is_completed: boolean
          is_locked: boolean
          launch_date: string | null
          launch_status: string | null
          mrp: number | null
          price_range: string | null
          product_id: string
          product_specification: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assign_to?: string | null
          channel?: string | null
          deadline_date?: string | null
          dealer_pricing?: number | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          launch_date?: string | null
          launch_status?: string | null
          mrp?: number | null
          price_range?: string | null
          product_id: string
          product_specification?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assign_to?: string | null
          channel?: string | null
          deadline_date?: string | null
          dealer_pricing?: number | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          launch_date?: string | null
          launch_status?: string | null
          mrp?: number | null
          price_range?: string | null
          product_id?: string
          product_specification?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_data_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sampling_data: {
        Row: {
          designer_feedback: string | null
          id: string
          is_completed: boolean
          is_locked: boolean
          product_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          sample_review_status: string
          sampler_name: string | null
          sampler_remarks: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          designer_feedback?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          product_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_review_status?: string
          sampler_name?: string | null
          sampler_remarks?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          designer_feedback?: string | null
          id?: string
          is_completed?: boolean
          is_locked?: boolean
          product_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_review_status?: string
          sampler_name?: string | null
          sampler_remarks?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sampling_data_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sampling_data_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sampling_data_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_unlock_requests: {
        Row: {
          created_at: string
          id: string
          product_id: string
          reason: string | null
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          stage: Database["public"]["Enums"]["workflow_stage"]
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          reason?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stage: Database["public"]["Enums"]["workflow_stage"]
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          reason?: string | null
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          stage?: Database["public"]["Enums"]["workflow_stage"]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_unlock_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_unlock_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_unlock_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_product_stage: {
        Args: {
          p_action: string
          p_department: string
          p_next_stage: Database["public"]["Enums"]["workflow_stage"]
          p_product_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      unlock_product_stage: {
        Args: {
          p_action: string
          p_department: string
          p_prev_stage: Database["public"]["Enums"]["workflow_stage"]
          p_product_id: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      product_category:
        | "bag"
        | "luggage"
        | "backpack"
        | "wallet"
        | "accessory"
        | "other"
      user_role:
        | "admin"
        | "design"
        | "merchandising"
        | "bom"
        | "marketing"
        | "marketing_head"
        | "sales"
        | "viewer"
        | "design_head"
        | "management"
        | "sampling"
        | "merchandising_head"
        | "purchase_head"
      workflow_stage:
        | "draft"
        | "design_completed"
        | "merchandising_completed"
        | "bom_finalized"
        | "marketing_ready"
        | "sales_priced"
        | "product_live"
        | "sampling_completed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      product_category: [
        "bag",
        "luggage",
        "backpack",
        "wallet",
        "accessory",
        "other",
      ],
      user_role: [
        "admin",
        "design",
        "merchandising",
        "bom",
        "marketing",
        "marketing_head",
        "sales",
        "viewer",
        "design_head",
        "management",
        "sampling",
        "merchandising_head",
      ],
      workflow_stage: [
        "draft",
        "design_completed",
        "merchandising_completed",
        "bom_finalized",
        "marketing_ready",
        "sales_priced",
        "product_live",
        "sampling_completed",
      ],
    },
  },
} as const
