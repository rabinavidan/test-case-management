package com.testflow.api.support;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Small blocking wrapper over the JDK's own {@link java.net.http.WebSocket} (no extra
 * dependency) for the real-time tests: collects text frames into a queue and records the
 * close code, so a test can say "the next frame is X" or "the server closed with 4401".
 *
 * <p>Tokens travel in the URL / connection_init payload rather than a header on purpose — that
 * is all a browser can do on a WebSocket handshake, and these tests exercise the same contract
 * (docs/asyncapi.yaml, docs/schema.graphql).
 */
public final class WsClient implements AutoCloseable {

    private static final String BASE_URL =
            System.getProperty("baseUrl", System.getenv().getOrDefault("BASE_URL", "http://localhost:8000"));

    private final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
    private final CompletableFuture<Integer> closeCode = new CompletableFuture<>();
    private final WebSocket socket;

    private WsClient(String path, String subprotocol) {
        URI uri = URI.create(BASE_URL.replaceFirst("^http", "ws") + path);
        WebSocket.Builder builder = HttpClient.newHttpClient().newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(10));
        if (subprotocol != null) {
            builder.subprotocols(subprotocol);
        }
        this.socket = builder.buildAsync(uri, new Listener()).join();
    }

    public static WsClient connect(String path) {
        return new WsClient(path, null);
    }

    public static WsClient connect(String path, String subprotocol) {
        return new WsClient(path, subprotocol);
    }

    public void send(String text) {
        socket.sendText(text, true).join();
    }

    /** The next text frame, failing the test if none arrives within {@code timeout}. */
    public String nextFrame(Duration timeout) {
        try {
            String frame = frames.poll(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (frame == null) {
                throw new AssertionError("No WebSocket frame within " + timeout
                        + (closeCode.isDone() ? " (socket closed with " + closeCode.join() + ")" : ""));
            }
            return frame;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AssertionError(e);
        }
    }

    /** The server's close code, failing the test if the socket isn't closed within {@code timeout}. */
    public int awaitCloseCode(Duration timeout) {
        try {
            return closeCode.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            throw new AssertionError("Socket was not closed within " + timeout, e);
        }
    }

    @Override
    public void close() {
        if (!socket.isOutputClosed()) {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "done").exceptionally(e -> null);
        }
        socket.abort();
    }

    private final class Listener implements WebSocket.Listener {
        private final StringBuilder partial = new StringBuilder();

        @Override
        public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
            partial.append(data);
            if (last) {
                frames.add(partial.toString());
                partial.setLength(0);
            }
            ws.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket ws, int statusCode, String reason) {
            closeCode.complete(statusCode);
            return null;
        }

        @Override
        public void onError(WebSocket ws, Throwable error) {
            closeCode.completeExceptionally(error);
        }
    }
}
