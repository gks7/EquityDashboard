from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0015_thesis_edit_history'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlphaDataPoint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('stock', models.CharField(db_index=True, max_length=20)),
                ('date', models.DateField()),
                ('price', models.FloatField()),
                ('pe', models.FloatField(blank=True, null=True)),
                ('forward_return', models.FloatField(blank=True, null=True)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['stock', 'date'],
                'unique_together': {('stock', 'date')},
                'indexes': [models.Index(fields=['stock', 'date'], name='finance_alp_stock_d57a36_idx')],
            },
        ),
    ]
