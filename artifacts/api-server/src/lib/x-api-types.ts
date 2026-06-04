/**
 * Type definitions for X/Twitter API responses
 * These types replace 'any' for better type safety
 */

export interface XApiError {
  error?: string;
  errors?: Array<{
    message?: string;
    detail?: string;
    code?: number;
  }>;
  detail?: string;
  __rawText?: string;
}

export interface XAccountSettings {
  screen_name?: string;
  [key: string]: unknown;
}

export interface XTimelineEntry {
  entryId?: string;
  sortIndex?: string;
  content?: {
    entryType?: string;
    __typename?: string;
    itemContent?: {
      tweet_results?: {
        result?: XTweetResult;
      };
    };
  };
}

export interface XTweetResult {
  __typename?: string;
  rest_id?: string;
  core?: {
    user_results?: {
      result?: XUserResult;
    };
  };
  legacy?: XTweetLegacy;
  tweet?: XTweetResult;
}

export interface XUserResult {
  __typename?: string;
  rest_id?: string;
  legacy?: {
    screen_name?: string;
    [key: string]: unknown;
  };
}

export interface XTweetLegacy {
  full_text?: string;
  extended_entities?: {
    media?: XMediaEntity[];
  };
  entities?: {
    media?: XMediaEntity[];
  };
}

export interface XMediaEntity {
  type?: string;
  media_url_https?: string;
  video_info?: {
    variants?: XVideoVariant[];
  };
  ext_alt_text?: string;
}

export interface XVideoVariant {
  bitrate?: number;
  content_type?: string;
  url?: string;
}

export interface XTimelineInstructions {
  type?: string;
  entries?: XTimelineEntry[];
  entry?: XTimelineEntry;
}

export interface XGraphQLResponse {
  data?: {
    user?: {
      result?: {
        timeline_v2?: {
          timeline?: {
            instructions?: XTimelineInstructions[];
          };
        };
        timeline?: {
          timeline?: {
            instructions?: XTimelineInstructions[];
          };
        };
      };
    };
    home?: {
      home_timeline_urt?: {
        instructions?: XTimelineInstructions[];
      };
    };
    home_timeline_urt?: {
      instructions?: XTimelineInstructions[];
    };
    create_tweet?: {
      tweet_results?: {
        result?: XTweetResult;
      };
    };
  };
  errors?: Array<{
    message?: string;
    detail?: string;
  }>;
}

export interface XMediaUploadResponse {
  media_id_string?: string;
  media_id?: number;
  processing_info?: {
    state?: string;
    check_after_secs?: number;
  };
}

export interface XMediaUploadInitResponse extends XMediaUploadResponse {
  expires_after_secs?: number;
}

export interface XCreateTweetResponse {
  data?: {
    create_tweet?: {
      tweet_results?: {
        result?: {
          rest_id?: string;
          legacy?: {
            full_text?: string;
          };
        };
      };
    };
  };
  errors?: Array<{
    message?: string;
    code?: number;
  }>;
}

/**
 * Type guard to check if response is an error
 */
export function isXApiError(payload: unknown): payload is XApiError {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return "error" in obj || "errors" in obj || "detail" in obj;
}

/**
 * Type guard for GraphQL response
 */
export function isXGraphQLResponse(payload: unknown): payload is XGraphQLResponse {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as Record<string, unknown>;
  return "data" in obj || "errors" in obj;
}
