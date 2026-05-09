import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: process.env.S3_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
      // Disable default integrity checksums so signed URLs don't include
      // x-amz-checksum-mode=ENABLED, which can confuse browser CORS preflights.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return _client;
}

function bucketOperations(bucket: string) {
  return {
    async createSignedUrl(path: string, expiresIn: number) {
      try {
        const cmd = new GetObjectCommand({ Bucket: bucket, Key: path });
        const signedUrl = await getSignedUrl(getS3Client(), cmd, { expiresIn });
        return { data: { signedUrl, path }, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },

    async createSignedUrls(paths: string[], expiresIn: number) {
      try {
        const data = await Promise.all(
          paths.map(async (path) => {
            const cmd = new GetObjectCommand({ Bucket: bucket, Key: path });
            const signedUrl = await getSignedUrl(getS3Client(), cmd, { expiresIn });
            return { path, signedUrl, error: null };
          }),
        );
        return { data, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },

    async upload(
      path: string,
      body: Buffer | File | Blob | ArrayBuffer | Uint8Array,
      options?: { contentType?: string; upsert?: boolean },
    ) {
      try {
        let bodyBuffer: Buffer;
        if (Buffer.isBuffer(body)) {
          bodyBuffer = body;
        } else if (body instanceof Blob || body instanceof File) {
          bodyBuffer = Buffer.from(await body.arrayBuffer());
        } else {
          bodyBuffer = Buffer.from(new Uint8Array(body as ArrayBuffer));
        }
        await getS3Client().send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: path,
            Body: bodyBuffer,
            ContentType: options?.contentType,
          }),
        );
        return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },

    async remove(paths: string[]) {
      try {
        if (paths.length === 0) return { data: [], error: null };
        await getS3Client().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: paths.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        return { data: paths.map((p) => ({ name: p })), error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },

    async download(path: string) {
      try {
        const response = await getS3Client().send(
          new GetObjectCommand({ Bucket: bucket, Key: path }),
        );
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const blob = new Blob([buffer]);
        return { data: blob, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },

    async copy(fromPath: string, toPath: string) {
      try {
        await getS3Client().send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: encodeURIComponent(`${bucket}/${fromPath}`),
            Key: toPath,
          }),
        );
        return { data: { path: toPath }, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },

    async move(fromPath: string, toPath: string) {
      try {
        await getS3Client().send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: encodeURIComponent(`${bucket}/${fromPath}`),
            Key: toPath,
          }),
        );
        await getS3Client().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: [{ Key: fromPath }], Quiet: true },
          }),
        );
        return { data: { message: "Successfully moved" }, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },

    async list(prefix: string, options?: { search?: string }) {
      try {
        const effectivePrefix = options?.search
          ? `${prefix}/${options.search}`
          : `${prefix}/`;
        const response = await getS3Client().send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: effectivePrefix }),
        );
        const files = (response.Contents ?? [])
          .map(({ Key }) => ({ name: Key?.slice(prefix.length + 1) ?? "" }))
          .filter((f) => f.name && !f.name.includes("/"));
        return { data: files, error: null };
      } catch (e) {
        return { data: null, error: { message: String(e) } };
      }
    },
  };
}

/**
 * Returns an S3-backed storage client with the same interface as the
 * Supabase storage client, so all call-sites remain unchanged.
 */
export function createStorageClient() {
  return {
    storage: {
      from: (bucket: string) => bucketOperations(bucket),
    },
  };
}
