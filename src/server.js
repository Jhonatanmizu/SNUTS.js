import Fastify from "fastify";
import { configDotenv } from "dotenv";
import analyzeRoutes from "./routes/analyze.route.js";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
configDotenv();

const host = process.env.HOST || "localhost";
const port = process.env.PORT || 3000;

const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

server.register(swagger, {
  openapi: {
    openapi: "3.0.0",
    info: {
      title: "SNUTS.js: Sniffing Nasty Unit Test Smells in JavaScript",
      description:
        "This API can detect test smells in JavaScript public repositories.",
      version: "0.1.0",
    },
    tags: [{ name: "analyze", description: "Analyze related end-points" }],
    // externalDocs: {
    //   url: "https://swagger.io",
    //   description: "Find more info here",
    // },
    apis: ["./routes/*.js"],
  },
});

server.register(swaggerUi, {
  routePrefix: "/documentation",
  uiConfig: {
    docExpansion: "full",
    deepLinking: false,
  },
  uiHooks: {
    onRequest: function (request, reply, next) {
      next();
    },
    preHandler: function (request, reply, next) {
      next();
    },
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
  transformSpecification: (swaggerObject) => {
    return swaggerObject;
  },
  transformSpecificationClone: true,
});

server.register(helmet);
server.register(cors, {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
});

server.register(analyzeRoutes);

server.get("/ping", (request, reply) => {
  reply.send({ message: "pong" });
});

server.get("/health", (request, reply) => {
  reply.send({ status: "ok" });
});

const handleStartServer = async () => {
  await server.listen({ host, port }, (err, address) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    console.log(`Server is now listening on http://localhost:${address}`);
  });
  return server;
};

const handleStopServer = async () => {
  await server.close();
  return server;
};
handleStartServer();

export { handleStartServer, handleStopServer, server };
