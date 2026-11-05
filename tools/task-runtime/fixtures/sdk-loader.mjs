export async function resolve(specifier, context, next) {
  if (specifier === "@github/copilot-sdk/extension") {
    return { shortCircuit: true, url: new URL("./sdk-test-host.mjs", import.meta.url).href };
  }
  return next(specifier, context);
}
