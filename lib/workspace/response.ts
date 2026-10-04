// A proxy may return an HTML error instead of the API's JSON contract.
// Never infer no effect or automatically repeat a mutation in that case.
export async function workspaceJson(response: Response) {
  try {
    return await response.json();
  } catch {
    throw new Error(
      "The workspace could not confirm this request. Reload the page to check saved state before another action.",
    );
  }
}
