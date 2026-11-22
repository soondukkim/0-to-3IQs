$rg = "<resource-group-name>"
$cosmos = "<cosmosdb-account-name>"
$principalId = "<object-principal-id>"

az cosmosdb sql role assignment create --account-name $cosmos --resource-group $rg `
  --role-definition-name "Cosmos DB Built-in Data Contributor" --principal-id $principalId --scope "/"

