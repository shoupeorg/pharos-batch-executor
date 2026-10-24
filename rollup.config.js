import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "src/worker.js",
  output: { file: "worker.js", format: "es" },
  plugins: [resolve({ browser: true }), commonjs()],
};
