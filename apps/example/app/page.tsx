import { getPageTimestamp } from "../lib/timestamps";

const Page = async () => {
  const timestamp = await getPageTimestamp();

  return (
    <main>
      <h1>next-cache-handlers example</h1>
      <p>
        This page is prerendered and stored through <code>cacheHandler</code>.
        Every instance that shares the Redis serves the same render until the{" "}
        <code>example</code> tag is revalidated.
      </p>
      <p>
        Rendered at{" "}
        <time data-timestamp="page" dateTime={timestamp}>
          {timestamp}
        </time>
        .
      </p>
    </main>
  );
};

export default Page;
