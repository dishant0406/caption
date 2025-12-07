import { env, getDatabaseConfig, isDevelopment, isProduction } from '@/config';
import { logger } from '@/plugins/logger';
import { Options, Sequelize } from 'sequelize';

export class DatabaseManager {
  private sequelize: Sequelize | null = null;
  private isConnected = false;

  // Get Sequelize instance
  getInstance(): Sequelize {
    if (!this.sequelize) {
      throw new Error('Database not initialized. Call connect() first.');
    }
    return this.sequelize;
  }

  // Connect to database
  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const dbConfig = getDatabaseConfig();
      const sequelizeOptions: Options = {
        ...this.getSequelizeOptions(),
        logging: isDevelopment()
          ? (sql: string) => logger.debug('SQL Query', { sql })
          : false,
      };

      // Add SSL configuration to Sequelize options
      if (env.DATABASE_SSL) {
        logger.info('Enabling SSL for database connection');
        sequelizeOptions.dialectOptions = {
          ...sequelizeOptions.dialectOptions,
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        };
      } else {
        logger.info('Disabling SSL for database connection');
        sequelizeOptions.dialectOptions = {
          ...sequelizeOptions.dialectOptions,
          ssl: false,
        };
      }

      // Create Sequelize instance
      if ('url' in dbConfig) {
        this.sequelize = new Sequelize(dbConfig.url, sequelizeOptions);
      } else {
        const { database, username, password, host, port } = dbConfig;
        
        // Validate required connection parameters
        if (!database || !username || !host || !port) {
          throw new Error('Missing required database connection parameters');
        }

        this.sequelize = new Sequelize({
          database,
          username,
          password: password ?? '',
          host,
          port,
          dialect: 'postgres',
          ...sequelizeOptions,
        });
      }

      // Test connection
      await this.sequelize.authenticate();
      this.isConnected = true;

      logger.info('Database connection established successfully', {
        host:
          typeof dbConfig === 'object' && 'host' in dbConfig
            ? dbConfig.host
            : 'from-url',
        database:
          typeof dbConfig === 'object' && 'database' in dbConfig
            ? dbConfig.database
            : 'from-url',
      });
    } catch (error) {
      logger.error(
        'Unable to connect to database',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  // Disconnect from database
  async disconnect(): Promise<void> {
    if (this.sequelize && this.isConnected) {
      await this.sequelize.close();
      this.isConnected = false;
      this.sequelize = null;
      logger.info('Database connection closed');
    }
  }

  // Check if connected
  isConnectionActive(): boolean {
    return this.isConnected && this.sequelize !== null;
  }

  // Sync database (development only)
  async sync(options?: { force?: boolean; alter?: boolean }): Promise<void> {
    if (!this.sequelize) {
      throw new Error('Database not connected');
    }

    if (isProduction() && options?.force) {
      throw new Error('Force sync is not allowed in production');
    }

    try {
      await this.sequelize.sync(options);
      logger.info('Database synchronized', options);
    } catch (error) {
      logger.error(
        'Database sync failed',
        error instanceof Error ? error : new Error('Unknown error')
      );
      throw error;
    }
  }

  // Get Sequelize options
  private getSequelizeOptions(): Partial<Options> {
    return {
      dialect: 'postgres',
      pool: {
        min: env.DATABASE_POOL_MIN,
        max: env.DATABASE_POOL_MAX,
        acquire: 30000, // 30 seconds
        idle: 10000, // 10 seconds
      },
      retry: {
        max: 3,
        backoffBase: 1000,
        backoffExponent: 1.5,
      },
      logQueryParameters: isDevelopment(),
      benchmark: isDevelopment(),
      define: {
        timestamps: true,
        underscored: true,
        paranoid: false,
        freezeTableName: true,
      },
    };
  }

  // Health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: Record<string, unknown>;
  }> {
    try {
      if (!this.sequelize) {
        return {
          status: 'unhealthy',
          details: { error: 'Database not initialized' },
        };
      }

      await this.sequelize.authenticate();

      const [results] = await this.sequelize.query(
        'SELECT NOW() as current_time'
      );
      const currentTime = (results as Record<string, unknown>[])[0]
        ?.current_time;

      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          currentTime,
          poolSize: {
            min: env.DATABASE_POOL_MIN,
            max: env.DATABASE_POOL_MAX,
          },
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          connected: this.isConnected,
        },
      };
    }
  }

  // Get connection info
  getConnectionInfo(): Record<string, unknown> {
    if (!this.sequelize) {
      return { status: 'not_connected' };
    }

    const config = this.sequelize.config;
    return {
      status: this.isConnected ? 'connected' : 'disconnected',
      database: config.database,
      host: config.host,
      port: config.port,
      dialect: 'postgres',
      pool: config.pool,
    };
  }
}

// Singleton instance
const databaseManager = new DatabaseManager();

// Export singleton methods
export const database = {
  connect: (): Promise<void> => databaseManager.connect(),
  disconnect: (): Promise<void> => databaseManager.disconnect(),
  getInstance: (): Sequelize => databaseManager.getInstance(),
  isConnected: (): boolean => databaseManager.isConnectionActive(),
  sync: (options?: { force?: boolean; alter?: boolean }): Promise<void> =>
    databaseManager.sync(options),
  healthCheck: (): Promise<{
    status: 'healthy' | 'unhealthy';
    details: Record<string, unknown>;
  }> => databaseManager.healthCheck(),
  getInfo: (): Record<string, unknown> => databaseManager.getConnectionInfo(),
};

// Initialize database connection
export const initializeDatabase = async (): Promise<void> => {
  await database.connect();
};

// Export Sequelize instance getter
export const getSequelize = (): Sequelize => database.getInstance();
