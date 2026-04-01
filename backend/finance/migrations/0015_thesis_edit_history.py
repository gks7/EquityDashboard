from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finance', '0014_add_dashboard_url_to_stock'),
    ]

    operations = [
        # Remove unique_together on InvestmentThesis
        migrations.AlterUniqueTogether(
            name='investmentthesis',
            unique_together=set(),
        ),
        # Add ThesisEditHistory model
        migrations.CreateModel(
            name='ThesisEditHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('edited_at', models.DateTimeField(auto_now_add=True)),
                ('summary', models.TextField(blank=True, default='')),
                ('conviction', models.IntegerField(default=3)),
                ('target_pe_multiple', models.FloatField(default=0)),
                ('target_eps', models.FloatField(default=0)),
                ('accumulated_dividends_5y', models.FloatField(default=0)),
                ('edited_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='thesis_edits', to=settings.AUTH_USER_MODEL)),
                ('stock', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='thesis_edit_history', to='finance.stock')),
            ],
            options={
                'ordering': ['-edited_at'],
                'verbose_name_plural': 'Thesis edit histories',
            },
        ),
    ]
