import { httpHeaderRedactionLayer } from "@t3tools/shared/httpObservability";
import { makeLocalFileTracer, makeTraceSink, type TraceSink } from "@t3tools/shared/observability";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as References from "effect/References";
import * as Path from "effect/Path";
import * as Tracer from "effect/Tracer";
import * as OtlpMetrics from "effect/unstable/observability/OtlpMetrics";
import * as OtlpSerialization from "effect/unstable/observability/OtlpSerialization";
import * as OtlpTracer from "effect/unstable/observability/OtlpTracer";

import * as ServerConfig from "../../config.ts";
import { ServerLoggerLive } from "../../serverLogger.ts";
import * as BrowserTraceCollector from "../BrowserTraceCollector.ts";

const otlpSerializationLayer = OtlpSerialization.layerJson;

const combineTraceSinks = (primary: TraceSink, secondary?: TraceSink): TraceSink => {
  if (secondary === undefined) {
    return primary;
  }

  return {
    filePath: secondary.filePath,
    push(record) {
      primary.push(record);
      secondary.push(record);
    },
    flush: primary.flush.pipe(Effect.andThen(secondary.flush)),
    close: () => primary.close().pipe(Effect.andThen(secondary.close())),
  } satisfies TraceSink;
};

export const ObservabilityLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const path = yield* Path.Path;
    const fileSystem = yield* FileSystem.FileSystem;
    const environmentId = yield* fileSystem.readFileString(config.environmentIdPath).pipe(
      Effect.map((raw) => raw.trim()),
      Effect.map((raw) => (raw.length > 0 ? raw : null)),
      Effect.catch(() => Effect.succeed(null)),
    );
    const environmentTracePath =
      environmentId === null
        ? null
        : path.join(path.dirname(config.serverTracePath), `server.trace.${environmentId}.ndjson`);

    yield* Effect.logInfo("server trace logging configured", {
      traceFilePath: config.serverTracePath,
      ...(environmentTracePath !== null ? { environmentTraceFilePath: environmentTracePath } : {}),
      ...(environmentId !== null ? { environmentId } : {}),
      environmentIdPath: config.environmentIdPath,
    });

    const traceReferencesLayer = Layer.mergeAll(
      Layer.succeed(Tracer.MinimumTraceLevel, config.traceMinLevel),
      Layer.succeed(References.TracerTimingEnabled, config.traceTimingEnabled),
      httpHeaderRedactionLayer,
    );

    const tracerLayer = Layer.unwrap(
      Effect.gen(function* () {
        const primarySink = yield* makeTraceSink({
          filePath: config.serverTracePath,
          maxBytes: config.traceMaxBytes,
          maxFiles: config.traceMaxFiles,
          batchWindowMs: config.traceBatchWindowMs,
        });
        const secondarySink =
          environmentTracePath === null
            ? null
            : yield* makeTraceSink({
                filePath: environmentTracePath,
                maxBytes: config.traceMaxBytes,
                maxFiles: config.traceMaxFiles,
                batchWindowMs: config.traceBatchWindowMs,
              });

        const sink = combineTraceSinks(primarySink, secondarySink ?? undefined);
        const delegate =
          config.otlpTracesUrl === undefined
            ? undefined
            : yield* OtlpTracer.make({
                url: config.otlpTracesUrl,
                exportInterval: `${config.otlpExportIntervalMs} millis`,
                resource: {
                  serviceName: config.otlpServiceName,
                  attributes: {
                    "service.runtime": "t3-server",
                    "service.mode": config.mode,
                  },
                },
              });

        const tracer = yield* makeLocalFileTracer({
          filePath: config.serverTracePath,
          maxBytes: config.traceMaxBytes,
          maxFiles: config.traceMaxFiles,
          batchWindowMs: config.traceBatchWindowMs,
          sink,
          ...(delegate ? { delegate } : {}),
        });

        return Layer.mergeAll(
          Layer.succeed(Tracer.Tracer, tracer),
          BrowserTraceCollector.layer(sink),
        );
      }),
    ).pipe(Layer.provideMerge(otlpSerializationLayer));

    const metricsLayer =
      config.otlpMetricsUrl === undefined
        ? Layer.empty
        : OtlpMetrics.layer({
            url: config.otlpMetricsUrl,
            exportInterval: `${config.otlpExportIntervalMs} millis`,
            resource: {
              serviceName: config.otlpServiceName,
              attributes: {
                "service.runtime": "t3-server",
                "service.mode": config.mode,
              },
            },
          }).pipe(Layer.provideMerge(otlpSerializationLayer));

    return Layer.mergeAll(ServerLoggerLive, traceReferencesLayer, tracerLayer, metricsLayer);
  }),
);
