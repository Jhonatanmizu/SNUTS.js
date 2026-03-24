import helpers from "../common/helpers/index.js";
import path from "node:path";
import { detectors } from "../common/detectors/index.js";
import astService from "./ast.service.js";
import process from "node:process";
import fs from "node:fs/promises";
import {
  getSinglePassDetectorResult,
  runSinglePassDetectors,
  supportsSinglePass,
} from "../common/detectors/singlePassRunner.js";

const DEFAULT_MAX_ANALYZE_FILES = 2000;
const DEFAULT_ANALYZE_CONCURRENCY = 8;
const DEFAULT_MAX_FILE_SIZE_BYTES = 1024 * 1024;
const DEFAULT_PARSE_TIMEOUT_MS = 5000;

const WARNING_CODES = {
  FILE_LIMIT: "FILE_LIMIT",
  FILE_SIZE_LIMIT: "FILE_SIZE_LIMIT",
  FILE_PARSE_TIMEOUT: "FILE_PARSE_TIMEOUT",
  FILE_PARSE_ERROR: "FILE_PARSE_ERROR",
};

class AnalyzeService {
  getMaxAnalyzeFiles() {
    const parsedValue = Number.parseInt(process.env.MAX_ANALYZE_FILES, 10);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      return DEFAULT_MAX_ANALYZE_FILES;
    }
    return parsedValue;
  }

  getConcurrency() {
    const parsedValue = Number.parseInt(process.env.ANALYZE_CONCURRENCY, 10);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      return DEFAULT_ANALYZE_CONCURRENCY;
    }
    return parsedValue;
  }

  getMaxFileSizeBytes() {
    const parsedValue = Number.parseInt(
      process.env.MAX_ANALYZE_FILE_SIZE_BYTES,
      10
    );
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      return DEFAULT_MAX_FILE_SIZE_BYTES;
    }
    return parsedValue;
  }

  getParseTimeoutMs() {
    const parsedValue = Number.parseInt(process.env.ANALYZE_PARSE_TIMEOUT_MS, 10);
    if (Number.isNaN(parsedValue) || parsedValue <= 0) {
      return DEFAULT_PARSE_TIMEOUT_MS;
    }
    return parsedValue;
  }

  limitFiles(testFiles) {
    const maxAnalyzeFiles = this.getMaxAnalyzeFiles();
    if (testFiles.length <= maxAnalyzeFiles) {
      return {
        filesToAnalyze: testFiles,
        warnings: [],
      };
    }

    console.warn(
      `[AnalyzeService] Too many test files (${testFiles.length}). ` +
        `Only the first ${maxAnalyzeFiles} files will be analyzed.`
    );
    return {
      filesToAnalyze: testFiles.slice(0, maxAnalyzeFiles),
      warnings: [
        {
          code: WARNING_CODES.FILE_LIMIT,
          details: {
            totalFiles: testFiles.length,
            analyzedFiles: maxAnalyzeFiles,
          },
        },
      ],
    };
  }

  async processWithConcurrency(items, worker) {
    if (!items.length) {
      return [];
    }

    const concurrency = Math.min(this.getConcurrency(), items.length);
    const results = new Array(items.length);
    let currentIndex = 0;

    const runWorker = async () => {
      while (true) {
        const itemIndex = currentIndex;
        currentIndex += 1;
        if (itemIndex >= items.length) {
          return;
        }

        results[itemIndex] = await worker(items[itemIndex]);
      }
    };

    await Promise.all(
      Array.from({ length: concurrency }, () => runWorker())
    );
    return results;
  }

  async analyzeFile(tf, toCSV = false) {
    const warnings = [];
    const file = helpers.getPathAfterPublic(tf);
    const fileInfo = await fs.stat(tf);

    if (fileInfo.size > this.getMaxFileSizeBytes()) {
      warnings.push({
        code: WARNING_CODES.FILE_SIZE_LIMIT,
        file,
        details: {
          fileSizeBytes: fileInfo.size,
          maxFileSizeBytes: this.getMaxFileSizeBytes(),
        },
      });
      return { rows: [], warnings };
    }

    let testAst;
    const parseTimeoutMs = this.getParseTimeoutMs();
    let timeoutId;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("Parse timeout exceeded")),
          parseTimeoutMs
        );
      });

      testAst = await Promise.race([astService.parseFileToAst(tf), timeoutPromise]);
    } catch (error) {
      const isTimeoutError = error?.message === "Parse timeout exceeded";
      warnings.push({
        code: isTimeoutError
          ? WARNING_CODES.FILE_PARSE_TIMEOUT
          : WARNING_CODES.FILE_PARSE_ERROR,
        file,
        details: isTimeoutError
          ? { timeoutMs: parseTimeoutMs }
          : { message: error?.message || "Unknown parse error" },
      });

      return { rows: [], warnings };
    } finally {
      clearTimeout(timeoutId);
    }

    const testInfo = astService.getTestInfo(testAst);
    const singlePassResults = runSinglePassDetectors(testAst);

    const rows = detectors.map((detector) => {
      const smells = supportsSinglePass(detector.name)
        ? getSinglePassDetectorResult(singlePassResults, detector.name)
        : detector(testAst);

      const baseResult = {
        file,
        type: detector.name.replace("detect", ""),
        smells,
      };

      if (!toCSV) {
        return {
          ...baseResult,
          info: testInfo,
        };
      }

      return {
        ...baseResult,
        itCount: testInfo.itCount,
        describeCount: testInfo.describeCount,
      };
    });

    return {
      rows,
      warnings,
    };
  }

  async handleAnalyze(repoUrl) {
    const __dirname = path.dirname("");
    const directory = path.resolve(__dirname, "./public");
    const repoFolder = helpers.getRepositoryFolder(repoUrl);
    try {
      await helpers.downloadRepository(repoUrl, repoFolder);
      const testFiles = await helpers.findTestFiles(directory);
      const { filesToAnalyze, warnings: limitWarnings } = this.limitFiles(testFiles);
      const astFiles = await this.processWithConcurrency(
        filesToAnalyze,
        async (tf) => this.analyzeFile(tf)
      );

      const warnings = [
        ...limitWarnings,
        ...astFiles.flatMap((fileResult) => fileResult.warnings),
      ];
      const data = astFiles.flatMap((fileResult) => fileResult.rows);

      await helpers.deleteDownloadRepositories(directory);
      return {
        data,
        warnings,
        meta: {
          totalTestFiles: testFiles.length,
          analyzedFiles: filesToAnalyze.length,
        },
      };
    } catch (error) {
      await helpers.deleteDownloadRepositories(directory);
      console.error("Error when we tried to handle analyze", error);
      throw error;
    }
  }
  async handleAnalyzeToCSV(repoUrl) {
    const __dirname = path.dirname("");
    const directory = path.resolve(__dirname, "./public");
    const repoFolder = helpers.getRepositoryFolder(repoUrl);
    try {
      await helpers.downloadRepository(repoUrl, repoFolder);
      const testFiles = await helpers.findTestFiles(directory);
      const { filesToAnalyze, warnings: limitWarnings } = this.limitFiles(testFiles);
      const astFiles = await this.processWithConcurrency(
        filesToAnalyze,
        async (tf) => this.analyzeFile(tf, true)
      );

      const warnings = [
        ...limitWarnings,
        ...astFiles.flatMap((fileResult) => fileResult.warnings),
      ];
      const data = astFiles.flatMap((fileResult) => fileResult.rows);

      await helpers.deleteDownloadRepositories(directory);
      return {
        data,
        warnings,
        meta: {
          totalTestFiles: testFiles.length,
          analyzedFiles: filesToAnalyze.length,
        },
      };
    } catch (error) {
      await helpers.deleteDownloadRepositories(directory);
      console.error("Error when we tried to handle analyze to csv", error);
      throw error;
    }
  }

  async countTestFiles(repoUrl) {
    const __dirname = path.dirname("");
    const directory = path.resolve(__dirname, "./public");
    const repoFolder = helpers.getRepositoryFolder(repoUrl);
    try {
      await helpers.downloadRepository(repoUrl, repoFolder);
      const testFiles = await helpers.findTestFiles(directory);
      await helpers.deleteDownloadRepositories(directory);
      return testFiles.length;
    } catch (error) {
      await helpers.deleteDownloadRepositories(directory);
      console.error("Error when we tried to count test files", error);
      throw error;
    }
  }
}

const analyzeService = new AnalyzeService();
export default analyzeService;
