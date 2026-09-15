from google.ads.googleads.client import GoogleAdsClient
import yaml
import sys

client = GoogleAdsClient.load_from_dict({
    "developer_token": yaml.safe_load(open("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google-ads.yaml"))["developer_token"],
    "client_id": yaml.safe_load(open("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google-ads.yaml"))["client_id"],
    "client_secret": yaml.safe_load(open("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google-ads.yaml"))["client_secret"],
    "refresh_token": yaml.safe_load(open("/home/pusdatinkp/.hermes/profiles/manajer_toko_machelcrochet/google-ads.yaml"))["refresh_token"],
    "use_proto_plus": True
})
customer_id = "1201748397"
ga_service = client.get_service("GoogleAdsService")

query = """
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros
    FROM campaign
    WHERE campaign.name LIKE '%Amigurumi%'
"""
response = ga_service.search(customer_id=customer_id, query=query)
for row in response:
    print(f"ID: {row.campaign.id}, Name: {row.campaign.name}, Status: {row.campaign.status.name}, Impr: {row.metrics.impressions}, Clicks: {row.metrics.clicks}, Cost: {row.metrics.cost_micros/1000000}")
