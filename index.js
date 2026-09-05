// 4. Staff Application Intake Interaction Handler
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'start_staff_application') {
        const guild = interaction.guild;
        const user = interaction.user;

        const sanitizedUsername = user.username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'applicant';
        const channelName = `app-${sanitizedUsername}`;

        // Check if application channel already exists
        const existingChannel = guild.channels.cache.find(c => c.name === channelName);
        if (existingChannel) {
            return interaction.reply({
                content: `You already have an active application open in ${existingChannel}.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Find target category safely
            let targetCategory = null;
            if (CONFIG.APP_CATEGORY_ID && CONFIG.APP_CATEGORY_ID !== 'YOUR_APP_CATEGORY_ID') {
                targetCategory = guild.channels.cache.get(CONFIG.APP_CATEGORY_ID);
                if (!targetCategory) {
                    try {
                        targetCategory = await guild.channels.fetch(CONFIG.APP_CATEGORY_ID);
                    } catch (e) {
                        targetCategory = null;
                    }
                }
            }

            const overwrites = [
                {
                    id: guild.id, // @everyone
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                        PermissionsBitField.Flags.AttachFiles
                    ]
                },
                {
                    id: client.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                }
            ];

            // Add staff role overwrite only if it exists in the guild
            if (CONFIG.STAFF_ROLE_ID && guild.roles.cache.has(CONFIG.STAFF_ROLE_ID)) {
                overwrites.push({
                    id: CONFIG.STAFF_ROLE_ID,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory
                    ]
                });
            }

            const appChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: targetCategory ? targetCategory.id : null,
                permissionOverwrites: overwrites
            });

            await interaction.editReply({
                content: `Your private application channel has been created: ${appChannel}`,
                ephemeral: true
            });

            const answers = [];
            let questionIndex = 0;

            const promptEmbed = new EmbedBuilder()
                .setTitle(`Staff Application: ${user.tag}`)
                .setDescription("Answer each question directly in this channel. You have 30 minutes total.\n\n" + APP_QUESTIONS[questionIndex])
                .setColor(0x5865F2);

            await appChannel.send({ content: `${user}`, embeds: [promptEmbed] });

            const collector = appChannel.createMessageCollector({
                filter: (m) => m.author.id === user.id,
                time: 1800000
            });

            collector.on('collect', async (msg) => {
                answers.push({ question: APP_QUESTIONS[questionIndex], answer: msg.content });
                questionIndex++;

                if (questionIndex < APP_QUESTIONS.length) {
                    const nextEmbed = new EmbedBuilder()
                        .setDescription(APP_QUESTIONS[questionIndex])
                        .setColor(0x5865F2);
                    await appChannel.send({ embeds: [nextEmbed] });
                } else {
                    collector.stop('completed');
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'completed') {
                    await appChannel.send("✅ **Application submitted successfully!** Staff will review your answers. This channel will close in 15 seconds.");

                    const reviewChannel = guild.channels.cache.get(CONFIG.APP_LOG_CHANNEL_ID) 
                        || await guild.channels.fetch(CONFIG.APP_LOG_CHANNEL_ID).catch(() => null);

                    if (reviewChannel) {
                        const reviewEmbed = new EmbedBuilder()
                            .setTitle(`New Staff Application: ${user.tag} (${user.id})`)
                            .setColor(0x00FF7F)
                            .setTimestamp();

                        answers.forEach((entry, idx) => {
                            reviewEmbed.addFields({
                                name: `Q${idx + 1}`,
                                value: entry.answer.length > 1024 ? entry.answer.slice(0, 1020) + '...' : entry.answer
                            });
                        });

                        await reviewChannel.send({ embeds: [reviewEmbed] });
                    }

                    setTimeout(async () => {
                        await appChannel.delete().catch(() => {});
                    }, 15000);
                } else {
                    await appChannel.send("⚠️ **Application timed out.** This channel will close.");
                    setTimeout(async () => {
                        await appChannel.delete().catch(() => {});
                    }, 10000);
                }
            });

        } catch (err) {
            console.error('DETAILED APPLICATION ERROR:', err);
            await interaction.editReply({
                content: `❌ Error creating channel: \`${err.message}\``,
                ephemeral: true
            });
        }
    }
});
