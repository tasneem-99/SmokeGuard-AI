// SmokeGuard AI - Azure infrastructure (resource-group scope)
// az deployment group create -g smokeguard-rg -f infra/main.bicep
param location string = resourceGroup().location
param swaLocation string = 'westeurope'   // Static Web Apps supported region
param prefix string = 'smokeguard'
param frontendOrigin string = '*'          // tighten to the SWA URL after first deploy

// Placeholder image until CI/CD pushes the real one
param apiImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
param apiPort int = 80

var uid = uniqueString(resourceGroup().id)

resource law 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${prefix}-logs'
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${prefix}${uid}'
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'sg${uid}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { allowBlobPublicAccess: false, minimumTlsVersion: 'TLS1_2', supportsHttpsTrafficOnly: true }
}

resource blobSvc 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource uploads 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobSvc
  name: 'uploads'
  properties: { publicAccess: 'None' }
}

resource env 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
  }
}

resource api 'Microsoft.App/containerApps@2023-05-01' = {
  name: '${prefix}-api'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: apiPort, transport: 'auto' }
      registries: [ { server: acr.properties.loginServer, username: acr.listCredentials().username, passwordSecretRef: 'acr-password' } ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'storage-conn', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}' }
      ]
    }
    template: {
      containers: [ {
        name: 'api'
        image: apiImage
        resources: { cpu: json('1.0'), memory: '2Gi' }
        env: [
          { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'storage-conn' }
          { name: 'BLOB_CONTAINER', value: 'uploads' }
          { name: 'ALLOWED_ORIGINS', value: frontendOrigin }
        ]
      } ]
      scale: {
        minReplicas: 1
        maxReplicas: 5
        rules: [ { name: 'http-load', http: { metadata: { concurrentRequests: '20' } } } ]
      }
    }
  }
}

resource swa 'Microsoft.Web/staticSites@2022-09-01' = {
  name: '${prefix}-web'
  location: swaLocation
  sku: { name: 'Free', tier: 'Free' }
  properties: {}
}

output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output acrName string = acr.name
output webUrl string = 'https://${swa.properties.defaultHostname}'
output swaName string = swa.name
