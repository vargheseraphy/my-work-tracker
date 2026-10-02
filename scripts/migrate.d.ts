/**
 * Migration runner. Applies every file in db/migrations that is not yet recorded, in name order,
 * each inside one transaction, as the owner role.
 *
 *   npm run db:migrate                     apply to DATABASE_URL_OWNER
 *   npm run db:migrate -- --test           apply to DATABASE_URL_OWNER_TEST
 *   npm run db:migrate -- --url <url>      apply to any database
 */
export declare function migrationFiles(): string[];
export declare function migrate(url: string, log?: (message?: any, ...optionalParams: any[]) => void): Promise<string[]>;
/**
 * The first run meets databases that were migrated by hand in phase 0 and have no _migrations
 * table. Record what is already there rather than trying to apply it twice.
 */
export declare function adoptExisting(url: string): Promise<void>;
//# sourceMappingURL=migrate.d.ts.map