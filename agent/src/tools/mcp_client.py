from __future__ import annotations

from databricks.sdk import WorkspaceClient
from databricks_langchain import DatabricksMCPServer, DatabricksMultiServerMCPClient
from langchain_core.tools import BaseTool

from src.config import settings

# One tool list per schema, fetched once per process and reused; binding the
# customer per request (bind_customer) is a cheap wrapper around these.
_tools_by_schema: dict[str, list[BaseTool]] = {}


async def tools_for(schema: str) -> list[BaseTool]:
    if schema not in _tools_by_schema:
        workspace_client = WorkspaceClient()
        url = f"{workspace_client.config.host}/api/2.0/mcp/functions/{settings.uc_catalog}/{schema}"
        server = DatabricksMCPServer(name=schema, url=url, workspace_client=workspace_client)
        client = DatabricksMultiServerMCPClient([server])
        _tools_by_schema[schema] = await client.get_tools()
    return _tools_by_schema[schema]
