import { getSequelize } from '@/config/database';
import type { SessionStatus } from '@caption/shared';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  ModelStatic,
} from 'sequelize';

// Caption mode type - word-by-word or sentence chunks
export type CaptionMode = 'word' | 'sentence';

// CaptionSession model interface
export interface CaptionSessionModel
  extends Model<
    InferAttributes<CaptionSessionModel>,
    InferCreationAttributes<CaptionSessionModel>
  > {
  sessionId: string; // UUID primary key
  userPhone: string; // FK to User
  status: CreationOptional<SessionStatus>;
  originalVideoUrl: string;
  originalVideoDuration: CreationOptional<number | null>;
  originalVideoSize: CreationOptional<number | null>;
  originalVideoMetadata: CreationOptional<object | null>; // JSON
  selectedStyleId: CreationOptional<string | null>;
  captionMode: CreationOptional<CaptionMode>; // 'word' for single word, 'sentence' for chunks
  currentChunkIndex: CreationOptional<number>;
  totalChunks: CreationOptional<number>;
  finalVideoUrl: CreationOptional<string | null>;
  errorMessage: CreationOptional<string | null>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  completedAt: CreationOptional<Date | null>;
}

// CaptionSession model - will be initialized later
export let CaptionSession: ModelStatic<CaptionSessionModel>;

// Initialize CaptionSession model function
export const initializeCaptionSessionModel =
  (): ModelStatic<CaptionSessionModel> => {
    CaptionSession = getSequelize().define<CaptionSessionModel>(
      'CaptionSession',
      {
        sessionId: {
          type: DataTypes.STRING(36), // UUID
          primaryKey: true,
          allowNull: false,
        },
        userPhone: {
          type: DataTypes.STRING(15),
          allowNull: false,
          references: {
            model: 'users',
            key: 'phone_number',
          },
        },
        status: {
          type: DataTypes.ENUM(
            'PENDING',
            'CHUNKING',
            'TRANSCRIBING',
            'STYLE_SELECTION',
            'PREVIEW_READY',
            'REVIEWING',
            'RENDERING',
            'COMPLETED',
            'FAILED',
            'CANCELLED'
          ),
          defaultValue: 'PENDING',
        },
        originalVideoUrl: {
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        originalVideoDuration: {
          type: DataTypes.FLOAT, // seconds
          allowNull: true,
        },
        originalVideoSize: {
          type: DataTypes.BIGINT, // bytes
          allowNull: true,
        },
        originalVideoMetadata: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        selectedStyleId: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        captionMode: {
          type: DataTypes.ENUM('word', 'sentence'),
          defaultValue: 'sentence',
          allowNull: true,
        },
        currentChunkIndex: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
        },
        totalChunks: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
        },
        finalVideoUrl: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        completedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      {
        tableName: 'caption_sessions',
        indexes: [
          {
            fields: ['user_phone'],
          },
          {
            fields: ['status'],
          },
          {
            fields: ['user_phone', 'status'],
          },
          {
            fields: ['created_at'],
          },
        ],
      }
    );

    return CaptionSession;
  };
