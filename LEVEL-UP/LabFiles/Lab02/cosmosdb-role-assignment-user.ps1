$rg = "<resource-group-name>"
$cosmos = "<cosmosdb-account-name>"
$me = az ad signed-in-user show --query id -o tsv
az cosmosdb sql role assignment create --account-name $cosmos --resource-group $rg `
  --role-definition-name "Cosmos DB Built-in Data Contributor" --principal-id $me --scope "/"