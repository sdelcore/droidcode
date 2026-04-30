import { Generator, getConfig } from "@tanstack/router-generator"

const config = getConfig({
  routesDirectory: "./src/routes",
  generatedRouteTree: "./src/routeTree.gen.ts",
  target: "react",
})

const generator = new Generator({ config, root: process.cwd() })
await generator.run()
console.log("routeTree.gen.ts generated")
