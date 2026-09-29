from __future__ import annotations

import logging

from databricks.sdk import WorkspaceClient
from databricks_langchain import DatabricksMCPServer, DatabricksMultiServerMCPClient
from langchain_core.tools import BaseTool

from src.config import settings

logger = logging.getLogger(__name__)

# One tool list per schema, fetched once per process and reused; binding the
# customer per request (bind_customer) is a cheap wrapper around these.
_tools_by_schema: dict[str, list[BaseTool]] = {}


async def tools_for(schema: str) -> list[BaseTool]:
    if schema not in _tools_by_schema:
        workspace_client = WorkspaceClient()
        url = f"{workspace_client.config.host}/api/2.0/mcp/functions/{settings.uc_catalog}/{schema}"
        server = DatabricksMCPServer(name=schema, url=url, workspace_client=workspace_client)
        client = DatabricksMultiServerMCPClient([server])
        tools = await client.get_tools()
        if not tools:
            # No EXECUTE on the schema lists no tools: retry next request instead of caching it.
            logger.warning("No MCP tools listed for %s; check EXECUTE on the schema", schema)
            return []
        _tools_by_schema[schema] = tools
    return _tools_by_schema[schema]
