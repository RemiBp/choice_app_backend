import openai

client = openai.OpenAI(api_key="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")

models = client.models.list()
for model in models.data:
    print(model.id)
