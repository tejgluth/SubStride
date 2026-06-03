const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const analyticsRoot = path.resolve(workspaceRoot, "analytics");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot, analyticsRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@expo/vector-icons": path.dirname(
    require.resolve("@expo/vector-icons/package.json", {
      paths: [workspaceRoot, projectRoot],
    })
  ),
};

module.exports = config;
