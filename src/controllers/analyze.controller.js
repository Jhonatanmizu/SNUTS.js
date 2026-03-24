import { detectors } from "../common/detectors/index.js";
import helpers from "../common/helpers/index.js";
import analyzeService from "../services/analyze.service.js";
import { Parser } from "@json2csv/plainjs";
const csvParser = new Parser({});
class AnalyzeController {
  setAnalyzeWarningsHeaders(reply, warnings = [], meta = {}) {
    if (!warnings.length) {
      return;
    }

    const truncated = warnings.some((warning) => warning.code === "FILE_LIMIT");
    const skippedFiles = warnings.filter((warning) =>
      ["FILE_SIZE_LIMIT", "FILE_PARSE_TIMEOUT", "FILE_PARSE_ERROR"].includes(
        warning.code
      )
    ).length;

    reply.header("X-Analyze-Warning-Count", String(warnings.length));
    reply.header("X-Analyze-Truncated", String(truncated));
    reply.header("X-Analyze-Skipped-Files", String(skippedFiles));
    if (meta.totalTestFiles !== undefined) {
      reply.header("X-Analyze-Total-Test-Files", String(meta.totalTestFiles));
    }
    if (meta.analyzedFiles !== undefined) {
      reply.header("X-Analyze-Analyzed-Files", String(meta.analyzedFiles));
    }
  }

  async fetch(request, reply) {
    const data = detectors.map((detector) =>
      detector.name.replace("detect", "")
    );
    reply.send({ data });
  }

  async store(request, reply) {
    const { repository, hasTestSmell } = request.body;
    if (!repository) {
      return reply
        .status(403)
        .send({ message: "You should provide the repository url" });
    }
    const isAValidRepository = helpers.isValidRepositoryUrl(repository);

    if (!isAValidRepository) {
      return reply
        .status(422)
        .send({ message: "You should provide a valid repository url" });
    }

    try {
      const result = await analyzeService.handleAnalyze(repository);
      this.setAnalyzeWarningsHeaders(reply, result.warnings, result.meta);

      const data = result.data || [];
      const filteredResult = hasTestSmell
        ? data.filter((re) => !!re.smells && re.smells.length > 0)
        : data;

      reply.send(filteredResult);
    } catch (error) {
      console.error("error", error);
      reply
        .status(500)
        .send({ message: "Ocorreu um erro ao tentar analisar o repositório" });
    }
  }

  async getCSV(request, reply) {
    const { repository } = request.body;
    if (!repository) {
      return reply
        .status(403)
        .send({ message: "You should provide the repository url" });
    }
    const isAValidRepository = helpers.isValidRepositoryUrl(repository);

    if (!isAValidRepository) {
      return reply
        .status(422)
        .send({ message: "You should provide a valid repository url" });
    }

    try {
      const result = await analyzeService.handleAnalyzeToCSV(repository);
      this.setAnalyzeWarningsHeaders(reply, result.warnings, result.meta);

      const filteredResult = result.data.filter(
        (re) => !!re.smells && re.smells.length > 0
      );

      const csv = csvParser.parse(filteredResult);
      reply.header(
        "Content-Type",
        "text/csv",
        "Content-Disposition",
        "attachment; filename=data.csv"
      );
      reply.send(csv);
    } catch (error) {
      console.error("error", error);
      reply
        .status(500)
        .send({ message: "Ocorreu um erro ao tentar analisar o repositório" });
    }
  }

  async countTestFiles(request, reply) {
    const { repository } = request.body;
    if (!repository) {
      return reply
        .status(403)
        .send({ message: "You should provide the repository url" });
    }
    const isAValidRepository = helpers.isValidRepositoryUrl(repository);

    if (!isAValidRepository) {
      return reply
        .status(422)
        .send({ message: "You should provide a valid repository url" });
    }

    try {
      const result = await analyzeService.countTestFiles(repository);
      reply.send(result);
    } catch (error) {
      console.error("Error when we tried to count test files", error);
      reply.status(500).send({
        message:
          "Ocorreu um erro ao tentar contar os arquivos de teste do repositório",
      });
    }
  }
}

const analyzeController = new AnalyzeController();

export default analyzeController;
