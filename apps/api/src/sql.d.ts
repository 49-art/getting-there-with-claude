// Wrangler bundles *.sql files as text modules.
declare module '*.sql' {
  const sql: string;
  export default sql;
}
