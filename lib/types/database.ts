/**
 * Database type definitions for Supabase
 * These are placeholder types that will be replaced with generated types
 * from the actual Supabase schema
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          display_name: string | null;
          normalized_display_name: string | null;
          language_code: string;
          avatar_key: string | null;
          username_changed_at: string | null;
          avatar_change_count_today: number;
          avatar_last_reset_date: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          normalized_display_name: string;
          language_code?: string;
          avatar_key?: string | null;
          username_changed_at?: string | null;
          avatar_change_count_today?: number;
          avatar_last_reset_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          normalized_display_name?: string | null;
          language_code?: string;
          avatar_key?: string | null;
          username_changed_at?: string | null;
          avatar_change_count_today?: number;
          avatar_last_reset_date?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      nodes: {
        Row: {
          id: string;
          url: string | null;
          text_content: string | null;
          title: string | null;
          thumbnail_key: string | null;
          owner_id: string;
          language_code: string;
          origin_user_id: string;
          origin_created_at: string;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          url?: string | null;
          text_content?: string | null;
          title?: string | null;
          thumbnail_key?: string | null;
          owner_id: string;
          language_code?: string;
          origin_user_id: string;
          origin_created_at?: string;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          url?: string | null;
          text_content?: string | null;
          title?: string | null;
          thumbnail_key?: string | null;
          owner_id?: string;
          language_code?: string;
          origin_user_id?: string;
          origin_created_at?: string;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "nodes_owner_id_fkey";
            columns: ["owner_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      edges: {
        Row: {
          id: string;
          node_id: string;
          user_id: string;
          cause_id: string;
          sender_id: string | null;
          direction: string;
          depth: number | null;
          permission: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          node_id: string;
          user_id: string;
          cause_id: string;
          sender_id?: string | null;
          direction: string;
          depth?: number | null;
          permission?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          node_id?: string;
          user_id?: string;
          cause_id?: string;
          sender_id?: string | null;
          direction?: string;
          depth?: number | null;
          permission?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      folders: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          parent_folder_id: string | null;
          is_project: boolean;
          color_hex: string;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          parent_folder_id?: string | null;
          is_project?: boolean;
          color_hex?: string;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          parent_folder_id?: string | null;
          is_project?: boolean;
          color_hex?: string;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      folder_edges: {
        Row: {
          id: string;
          node_id: string;
          folder_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          node_id: string;
          folder_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          node_id?: string;
          folder_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocker_id: string;
          blocked_id: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
        };
        Update: {
          blocker_id?: string;
          blocked_id?: string;
        };
        Relationships: [];
      };
      causes: {
        Row: {
          id: string;
          cause_type: string;
          created_by: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          cause_type: string;
          created_by: string;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          cause_type?: string;
          created_by?: string;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      friend_invites: {
        Row: {
          id: string;
          from_user_id: string;
          to_user_id: string | null;
          to_email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_user_id: string;
          to_user_id?: string | null;
          to_email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          from_user_id?: string;
          to_user_id?: string | null;
          to_email?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      activity_log: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          target_id: string | null;
          target_type: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          action: string;
          target_id?: string | null;
          target_type?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          action?: string;
          target_id?: string | null;
          target_type?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_visible_nodes: {
        Args: { p_user_id: string };
        Returns: {
          id: string;
          url: string | null;
          text_content: string | null;
          title: string | null;
          thumbnail_key: string | null;
          owner_id: string;
          language_code: string;
          origin_user_id: string;
          origin_created_at: string;
          deleted_at: string | null;
          created_at: string;
        }[];
      };
      get_visible_node_by_id: {
        Args: { p_user_id: string; p_node_id: string };
        Returns: {
          id: string;
          url: string | null;
          text_content: string | null;
          title: string | null;
          thumbnail_key: string | null;
          owner_id: string;
          language_code: string;
          origin_user_id: string;
          origin_created_at: string;
          deleted_at: string | null;
          created_at: string;
        }[];
      };
      create_node: {
        Args: {
          p_owner_id: string;
          p_url: string | null;
          p_text_content: string | null;
          p_language_code?: string;
        };
        Returns: {
          id: string;
          url: string | null;
          text_content: string | null;
          title: string | null;
          thumbnail_key: string | null;
          owner_id: string;
          language_code: string;
          origin_user_id: string;
          origin_created_at: string;
          deleted_at: string | null;
          created_at: string;
        }[];
      };
      direct_share: {
        Args: {
          p_sharer_id: string;
          p_node_id: string;
          p_target_user_id: string;
          p_permission?: string;
        };
        Returns: string; // cause_id
      };
      unshare: {
        Args: {
          p_cause_id: string;
          p_requesting_user_id: string;
        };
        Returns: boolean;
      };
      get_friend_bar: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          user_id: string | null;
          display_name: string | null;
          avatar_key: string | null;
          to_email: string | null;
          is_pending: boolean;
          last_activity: string | null;
        }[];
      };
      group_share: {
        Args: {
          p_sharer_id: string;
          p_node_id: string;
          p_group_id: string;
          p_permission?: string;
        };
        Returns: string; // cause_id
      };
      group_unshare: {
        Args: {
          p_sharer_id: string;
          p_node_id: string;
          p_group_id: string;
        };
        Returns: boolean;
      };
      create_group: {
        Args: {
          p_owner_id: string;
          p_name: string;
          p_member_ids: string[];
        };
        Returns: {
          id: string;
          name: string;
          owner_id: string;
          deleted_at: string | null;
          created_at: string;
        }[];
      };
      // Permission functions (P13-T01)
      has_node_permission: {
        Args: {
          p_user_id: string;
          p_node_id: string;
          p_required_permission: string;
        };
        Returns: boolean;
      };
      has_folder_permission: {
        Args: {
          p_user_id: string;
          p_folder_id: string;
          p_required_permission: string;
        };
        Returns: boolean;
      };
      get_node_permission: {
        Args: {
          p_user_id: string;
          p_node_id: string;
        };
        Returns: string | null;
      };
      get_folder_permission: {
        Args: {
          p_user_id: string;
          p_folder_id: string;
        };
        Returns: string | null;
      };
      change_node_permission: {
        Args: {
          p_cause_id: string;
          p_requesting_user_id: string;
          p_new_permission: string;
        };
        Returns: boolean;
      };
      change_folder_permission: {
        Args: {
          p_folder_id: string;
          p_target_user_id: string;
          p_requesting_user_id: string;
          p_new_permission: string;
        };
        Returns: boolean;
      };
      create_folder: {
        Args: {
          p_owner_id: string;
          p_name: string;
          p_parent_folder_id?: string;
        };
        Returns: {
          id: string;
          name: string;
          owner_id: string;
          parent_folder_id: string | null;
          is_project: boolean;
          color_hex: string;
          deleted_at: string | null;
          created_at: string;
        }[];
      };
      share_folder: {
        Args: {
          p_sharer_id: string;
          p_folder_id: string;
          p_target_user_ids: string[];
          p_permission?: string;
        };
        Returns: string; // folder_share_op_id
      };
    };
    Views: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// Utility types for type-safe queries
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
