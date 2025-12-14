import path from 'path';
import { Sequelize } from 'sequelize';
import { SequelizeStorage, Umzug } from 'umzug';
import { getDatabaseConfig } from './env';

// Create Sequelize instance
const dbConfig = getDatabaseConfig();
const sequelize = 'url' in dbConfig 
  ? new Sequelize(dbConfig.url)
  : new Sequelize(dbConfig.database || 'caption', dbConfig.username || 'postgres', dbConfig.password || '', {
      host: dbConfig.host || 'localhost',
      port: dbConfig.port || 5432,
      dialect: 'postgres',
    });

// Create Umzug instance
const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, '../migrations/*.ts'),
    resolve: ({ name, path: filepath }) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require(filepath as string);
      return {
        name,
        up: async () => migration.default.up(sequelize.getQueryInterface()),
        down: async () =>
          migration.default.down(sequelize.getQueryInterface()),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

export async function runMigrations() {
  try {
    console.log('🔄 Running database migrations...');
    const migrations = await umzug.up();
    console.log(
      `✅ Migrations completed: ${migrations.map((m) => m.name).join(', ')}`
    );
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function rollbackMigration() {
  try {
    console.log('🔄 Rolling back last migration...');
    const migrations = await umzug.down();
    const migrationName = migrations?.[0]?.name || 'none';
    console.log(`✅ Rolled back: ${migrationName}`);
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}

export async function runSeeds() {
  try {
    console.log('🌱 Running database seeds...');

    // Import and run seeds
    const seeds = [require('../seeds/001-seed-plans').default];

    for (const seed of seeds) {
      await seed.up(sequelize.getQueryInterface());
    }

    console.log('✅ Seeds completed');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

// CLI commands
if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    try {
      await sequelize.authenticate();
      console.log('✅ Database connection established');

      switch (command) {
        case 'up':
          await runMigrations();
          break;
        case 'down':
          await rollbackMigration();
          break;
        case 'seed':
          await runSeeds();
          break;
        case 'reset':
          await rollbackMigration();
          await runMigrations();
          await runSeeds();
          break;
        default:
          console.log(`
Usage:
  npm run db:migrate:up     - Run pending migrations
  npm run db:migrate:down   - Rollback last migration
  npm run db:seed           - Run seeds
  npm run db:reset          - Reset and reseed database
          `);
      }

      await sequelize.close();
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      await sequelize.close();
      process.exit(1);
    }
  })();
}
