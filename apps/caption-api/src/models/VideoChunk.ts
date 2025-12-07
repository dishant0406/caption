import { getSequelize } from '@/config/database';
import type { ChunkStatus } from '@caption/shared';
import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    ModelStatic,
} from 'sequelize';

// VideoChunk model interface
export interface VideoChunkModel
  extends Model<
    InferAttributes<VideoChunkModel>,
    InferCreationAttributes<VideoChunkModel>
  > {
  chunkId: string; // UUID primary key
  sessionId: string; // FK to CaptionSession
  chunkIndex: number;
  chunkUrl: string;
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // seconds
  status: CreationOptional<ChunkStatus>;
  transcript: CreationOptional<string | null>; // JSON string of TranscriptSegment[]
  previewUrl: CreationOptional<string | null>;
  userApproved: CreationOptional<boolean>;
  reprocessCount: CreationOptional<number>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

// VideoChunk model - will be initialized later
export let VideoChunk: ModelStatic<VideoChunkModel>;

// Initialize VideoChunk model function
export const initializeVideoChunkModel = (): ModelStatic<VideoChunkModel> => {
  VideoChunk = getSequelize().define<VideoChunkModel>(
    'VideoChunk',
    {
      chunkId: {
        type: DataTypes.STRING(36), // UUID
        primaryKey: true,
        allowNull: false,
      },
      sessionId: {
        type: DataTypes.STRING(36),
        allowNull: false,
        references: {
          model: 'caption_sessions',
          key: 'session_id',
        },
      },
      chunkIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      chunkUrl: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      startTime: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      endTime: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      duration: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM(
          'PENDING',
          'TRANSCRIBING',
          'TRANSCRIBED',
          'GENERATING_PREVIEW',
          'PREVIEW_READY',
          'APPROVED',
          'REJECTED',
          'REPROCESSING'
        ),
        defaultValue: 'PENDING',
      },
      transcript: {
        type: DataTypes.TEXT, // JSON string
        allowNull: true,
      },
      previewUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      userApproved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      reprocessCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: 'video_chunks',
      indexes: [
        {
          fields: ['session_id'],
        },
        {
          fields: ['session_id', 'chunk_index'],
          unique: true,
        },
        {
          fields: ['status'],
        },
      ],
    }
  );

  return VideoChunk;
};
