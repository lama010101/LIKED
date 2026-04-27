export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      activity_log: {
        Row: {
          id: string
          user_id: string
          action: string
          target_id: string | null
          target_type: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          user_id: string
          action: string
          target_id: string | null
          target_type: string | null
          metadata: Json | null
        }
        Update: {
          id?: string | null
          user_id?: string | null
          action?: string | null
          target_id?: string | null
          target_type?: string | null
          metadata?: Json | null
          created_at?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocker_id: string
          blocked_id: string
        }
        Insert: {
          blocker_id: string
          blocked_id: string
        }
        Update: {
          blocker_id?: string | null
          blocked_id?: string | null
        }
        Relationships: []
      }
      causes: {
        Row: {
          id: string
          cause_type: string
          created_by: string
          created_at: string
          metadata: Json | null
        }
        Insert: {
          cause_type: string
          created_by: string
          metadata: Json | null
        }
        Update: {
          id?: string | null
          cause_type?: string | null
          created_by?: string | null
          created_at?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      direct_chats: {
        Row: {
          id: string
          user_1_id: string
          user_2_id: string
          created_at: string
        }
        Insert: {
          user_1_id: string
          user_2_id: string
        }
        Update: {
          id?: string | null
          user_1_id?: string | null
          user_2_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      edges: {
        Row: {
          id: string
          node_id: string
          user_id: string
          cause_id: string
          sender_id: string | null
          direction: string
          depth: number | null
          created_at: string
        }
        Insert: {
          node_id: string
          user_id: string
          cause_id: string
          sender_id: string | null
          direction: string
          depth: number | null
        }
        Update: {
          id?: string | null
          node_id?: string | null
          user_id?: string | null
          cause_id?: string | null
          sender_id?: string | null
          direction?: string | null
          depth?: number | null
          created_at?: string | null
        }
        Relationships: []
      }
      external_items_map: {
        Row: {
          id: string
          external_source_id: string
          external_id: string
          node_id: string
          created_at: string
        }
        Insert: {
          external_source_id: string
          external_id: string
          node_id: string
        }
        Update: {
          id?: string | null
          external_source_id?: string | null
          external_id?: string | null
          node_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      external_sources: {
        Row: {
          id: string
          name: string
          base_url: string
          created_at: string
        }
        Insert: {
          name: string
          base_url: string
        }
        Update: {
          id?: string | null
          name?: string | null
          base_url?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      folder_admins: {
        Row: {
          folder_id: string
          user_id: string
          granted_by: string
        }
        Insert: {
          folder_id: string
          user_id: string
          granted_by: string
        }
        Update: {
          folder_id?: string | null
          user_id?: string | null
          granted_by?: string | null
        }
        Relationships: []
      }
      folder_edges: {
        Row: {
          id: string
          node_id: string
          folder_id: string
          created_at: string
        }
        Insert: {
          node_id: string
          folder_id: string
        }
        Update: {
          id?: string | null
          node_id?: string | null
          folder_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      friend_invites: {
        Row: {
          id: string
          from_user_id: string
          to_user_id: string | null
          to_email: string
          created_at: string
        }
        Insert: {
          from_user_id: string
          to_user_id: string | null
          to_email: string
        }
        Update: {
          id?: string | null
          from_user_id?: string | null
          to_user_id?: string | null
          to_email?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      folder_tree: {
        Row: {
          folder_id: string
          ancestor_id: string
          depth: number
        }
        Insert: {
          folder_id: string
          ancestor_id: string
          depth: number
        }
        Update: {
          folder_id?: string | null
          ancestor_id?: string | null
          depth?: number | null
        }
        Relationships: []
      }
      folders: {
        Row: {
          id: string
          name: string
          owner_id: string
          parent_folder_id: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          name: string
          owner_id: string
          parent_folder_id: string | null
          deleted_at: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
          owner_id?: string | null
          parent_folder_id?: string | null
          deleted_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      group_admins: {
        Row: {
          group_id: string
          user_id: string
          granted_by: string
        }
        Insert: {
          group_id: string
          user_id: string
          granted_by: string
        }
        Update: {
          group_id?: string | null
          user_id?: string | null
          granted_by?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          user_id: string
        }
        Insert: {
          group_id: string
          user_id: string
        }
        Update: {
          group_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      group_messages: {
        Row: {
          id: string
          group_id: string
          sender_id: string
          content: string
          created_at: string
        }
        Insert: {
          group_id: string
          sender_id: string
          content: string
        }
        Update: {
          id?: string | null
          group_id?: string | null
          sender_id?: string | null
          content?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      group_nodes: {
        Row: {
          group_id: string
          node_id: string
          created_at: string
        }
        Insert: {
          group_id: string
          node_id: string
        }
        Update: {
          group_id?: string | null
          node_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          name: string
          owner_id: string
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          name: string
          owner_id: string
          deleted_at: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
          owner_id?: string | null
          deleted_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          chat_id: string
          sender_id: string
          content: string
          created_at: string
        }
        Insert: {
          chat_id: string
          sender_id: string
          content: string
        }
        Update: {
          id?: string | null
          chat_id?: string | null
          sender_id?: string | null
          content?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      node_messages: {
        Row: {
          id: string
          node_id: string
          sender_id: string
          content: string
          created_at: string
        }
        Insert: {
          node_id: string
          sender_id: string
          content: string
        }
        Update: {
          id?: string | null
          node_id?: string | null
          sender_id?: string | null
          content?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      nodes: {
        Row: {
          id: string
          url: string | null
          text_content: string | null
          title: string | null
          thumbnail_key: string | null
          owner_id: string
          language_code: string
          origin_user_id: string
          origin_created_at: string
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          url: string | null
          text_content: string | null
          title: string | null
          thumbnail_key: string | null
          owner_id: string
          origin_user_id: string
          deleted_at: string | null
        }
        Update: {
          id?: string | null
          url?: string | null
          text_content?: string | null
          title?: string | null
          thumbnail_key?: string | null
          owner_id?: string | null
          language_code?: string | null
          origin_user_id?: string | null
          origin_created_at?: string | null
          deleted_at?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      nodes_sort_cache: {
        Row: {
          node_id: string
          avg_rating: number | null
          view_count: number
          share_count: number
          updated_at: string
        }
        Insert: {
          node_id: string
          avg_rating: number | null
        }
        Update: {
          node_id?: string | null
          avg_rating?: number | null
          view_count?: number | null
          share_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          payload: Json | null
          read: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          type: string
          payload: Json | null
        }
        Update: {
          id?: string | null
          user_id?: string | null
          type?: string | null
          payload?: Json | null
          read?: boolean | null
          created_at?: string | null
        }
        Relationships: []
      }
      ratings: {
        Row: {
          id: string
          node_id: string
          user_id: string
          score: number
          updated_at: string
        }
        Insert: {
          node_id: string
          user_id: string
          score: number
        }
        Update: {
          id?: string | null
          node_id?: string | null
          user_id?: string | null
          score?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tag_edges: {
        Row: {
          id: string
          tag_id: string
          node_id: string | null
          folder_id: string | null
          created_at: string
        }
        Insert: {
          tag_id: string
          node_id: string | null
          folder_id: string | null
        }
        Update: {
          id?: string | null
          tag_id?: string | null
          node_id?: string | null
          folder_id?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      tag_translations: {
        Row: {
          id: string
          tag_id: string
          language_code: string
          label: string
          created_at: string
        }
        Insert: {
          tag_id: string
          language_code: string
          label: string
        }
        Update: {
          id?: string | null
          tag_id?: string | null
          language_code?: string | null
          label?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          color_hex: string
          created_at: string
        }
        Insert: {
          color_hex: string
        }
        Update: {
          id?: string | null
          color_hex?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      translations: {
        Row: {
          id: string
          node_id: string
          language_code: string
          title: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          node_id: string
          language_code: string
          title: string | null
          description: string | null
        }
        Update: {
          id?: string | null
          node_id?: string | null
          language_code?: string | null
          title?: string | null
          description?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          display_name: string
          normalized_display_name: string
          language_code: string
          avatar_key: string | null
          username_changed_at: string | null
          avatar_change_count_today: number
          avatar_last_reset_date: string | null
          created_at: string
        }
        Insert: {
          display_name: string
          normalized_display_name: string
          avatar_key: string | null
          username_changed_at: string | null
          avatar_last_reset_date: string | null
        }
        Update: {
          id?: string | null
          display_name?: string | null
          normalized_display_name?: string | null
          language_code?: string | null
          avatar_key?: string | null
          username_changed_at?: string | null
          avatar_change_count_today?: number | null
          avatar_last_reset_date?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_friend_bar: {
        Args: {
          p_user_id: string
        }
        Returns: {
          user_id: string | null
          display_name: string | null
          avatar_key: string | null
          to_email: string | null
          is_pending: boolean
          last_activity: string | null
        }[]
      }
      create_group: {
        Args: {
          p_owner_id: string
          p_name: string
          p_member_ids: any[]
        }
        Returns: unknown
      }
      create_node: {
        Args: {
          p_owner_id: string
          p_url: string
          p_text_content: string
          p_language_code: string
        }
        Returns: unknown
      }
      direct_share: {
        Args: {
          p_sharer_id: string
          p_node_id: string
          p_target_user_id: string
        }
        Returns: unknown
      }
      has_node_permission: {
        Args: {
          p_user_id: string
          p_node_id: string
          p_required_permission: string
        }
        Returns: boolean
      }
      has_folder_permission: {
        Args: {
          p_user_id: string
          p_folder_id: string
          p_required_permission: string
        }
        Returns: boolean
      }
      get_node_permission: {
        Args: {
          p_user_id: string
          p_node_id: string
        }
        Returns: unknown
      }
      get_folder_permission: {
        Args: {
          p_user_id: string
          p_folder_id: string
        }
        Returns: unknown
      }
      get_nodes_in_folder: {
        Args: {
          p_user_id: string
          p_folder_id: string
          p_sort: string
        }
        Returns: unknown
      }
      get_visible_node_by_id: {
        Args: {
          p_user_id: string
          p_node_id: string
        }
        Returns: unknown
      }
      get_visible_nodes: {
        Args: {
          p_user_id: string
          p_sort: string
        }
        Returns: unknown
      }
      group_share: {
        Args: {
          p_sharer_id: string
          p_node_id: string
          p_group_id: string
        }
        Returns: unknown
      }
      group_unshare: {
        Args: {
          p_sharer_id: string
          p_node_id: string
          p_group_id: string
        }
        Returns: unknown
      }
      unshare: {
        Args: {
          p_cause_id: string
          p_requesting_user_id: string
        }
        Returns: unknown
      }
      share_folder: {
        Args: {
          p_sharer_id: string
          p_folder_id: string
          p_target_user_ids: string[]
        }
        Returns: unknown
      }
      search_nodes: {
        Args: {
          p_user_id: string
          p_query: string
          p_language_code: string
          p_sort: string
          p_view: string
          p_mine_filter: string
        }
        Returns: unknown
      }
      get_feed: {
        Args: {
          p_user_id: string
          p_language_code?: string
          p_view?: string
          p_friend_id?: string
          p_folder_id?: string
          p_group_id?: string
          p_filter_tag_ids?: string[]
          p_filter_friend_ids?: string[]
          p_filter_folder_ids?: string[]
          p_search_query?: string
          p_sort?: string
          p_cursor_created_at?: string
          p_cursor_node_id?: string
          p_limit?: number
        }
        Returns: {
          node_id: string
          url: string | null
          text_content: string | null
          title: string | null
          thumbnail_key: string | null
          owner_id: string
          language_code: string
          origin_user_id: string
          origin_created_at: string
          created_at: string
          avg_rating: number | null
          view_count: number | null
          share_count: number | null
          direction: string
          sender_id: string | null
          sender_name: string | null
          sender_avatar_key: string | null
          tags: Json | null
          total_count: number
        }[]
      }
      upsert_rating: {
        Args: {
          p_user_id: string
          p_node_id: string
          p_score: number
        }
        Returns: unknown
      }
    }
    Views: {}
    Enums: {}
    CompositeTypes: {}
  }
}
